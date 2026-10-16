$(document).ready(function () {
  const registeredUsers = window.DJSALON_AUTH.getUsers();
        const setErr = (id, msg) => $(id).text(msg).toggleClass("d-none", !msg);
        const checkMatch = () => {
          const c = $("#regConfirm").val();
          setErr(
            "#regConfErr",
            c && c !== $("#regPassword").val() ? "Password not match" : "",
          );
          return !c || c === $("#regPassword").val();
        };
        $("#regName").on("input", function () {
          this.value = this.value.replace(/[^\p{L}\s'’.-]/gu, "");
          setErr("#regNameErr", "");
        });
        $("#regPhone").on("input", function () {
          this.value = this.value.replace(/\D/g, "").slice(0, 11);
          setErr("#regPhoneErr", "");
        });
        $("#regPassword, #regConfirm").on("input", checkMatch);
        $("#regUser").on("input", () => setErr("#regUserErr", ""));
        const faceModelUrl =
          "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/model";
        const maxIdentityImageBytes = 10 * 1024 * 1024;
        let idFaceDescriptor = null;
        let faceVerified = false;
        let cameraStream = null;
        let idCameraStream = null;
        let faceModelsLoading = null;
        let verificationGeneration = 0;
        let currentVerificationStep = 1;
        let idPreviewUrl = null;
        let capturedSelfieCanvas = null;
        let capturedSelfieDescriptor = null;
        let faceMonitorTimer = null;
        let faceMonitorBusy = false;
        let blinkProgress = {
          openFrames: 0,
          sawClosed: false,
          complete: false,
        };
        const activeOcrWorkers = new Set();
        const terminateOcrWorkers = () => {
          const workers = Array.from(activeOcrWorkers);
          activeOcrWorkers.clear();
          workers.forEach((worker) => worker.terminate());
        };
        const releaseCamera = () => {
          if (faceMonitorTimer) {
            clearTimeout(faceMonitorTimer);
            faceMonitorTimer = null;
          }
          if (cameraStream) {
            cameraStream.getTracks().forEach((track) => track.stop());
            cameraStream = null;
          }
          $("#faceVideo").addClass("d-none").get(0).srcObject = null;
          $("#faceGuide").addClass("d-none").removeClass("is-aligned");
          $("#captureFaceButton").addClass("d-none");
          $("#startCameraButton").removeClass("d-none");
        };
        const releaseIdCamera = () => {
          if (idCameraStream) {
            idCameraStream.getTracks().forEach((track) => track.stop());
            idCameraStream = null;
          }
          $("#idCaptureVideo").addClass("d-none").get(0).srcObject = null;
          $("#captureIdButton").addClass("d-none").prop("disabled", true);
          $("#startIdCameraButton").removeClass("d-none");
        };
        const setVerificationStatus = (selector, message, success = false) => {
          const status = $(selector);
          const isError = !!message && !success;
          if (
            status.text() === message &&
            status.hasClass("text-success") === success &&
            status.hasClass("text-danger") === isError
          ) {
            return;
          }
          status
            .text(message)
            .toggleClass("text-success", success)
            .toggleClass("text-danger", isError)
            .toggleClass("text-white-50", !message);
        };
        const setLoadingStatus = (selector, message) => {
          const status = $(selector).empty();
          $("<span>", {
            class: "spinner-border spinner-border-sm me-2",
            role: "status",
          }).appendTo(status);
          $("<span>").text(message).appendTo(status);
          status.removeClass("text-danger text-white-50").addClass("text-pink");
        };
        const setVerificationStep = (step) => {
          currentVerificationStep = step;
          $("[data-verification-panel]").each(function () {
            const active = Number(this.dataset.verificationPanel) === step;
            this.hidden = !active;
            $(this).toggleClass("d-none", !active);
          });
          $("[data-step-indicator]").each(function () {
            const number = Number(this.dataset.stepIndicator);
            $(this)
              .toggleClass("is-active", number === step)
              .toggleClass("is-complete", number < step)
              .attr("aria-current", number === step ? "step" : null);
          });
          if (step !== 3) releaseCamera();
          if (step !== 1) releaseIdCamera();
        };
        const clearCapturedSelfie = () => {
          if (capturedSelfieCanvas) {
            capturedSelfieCanvas.width = 0;
            capturedSelfieCanvas.height = 0;
            capturedSelfieCanvas = null;
          }
          capturedSelfieDescriptor = null;
          $("#selfiePreviewWrap").addClass("d-none");
          $("#selfiePreview").removeAttr("width height");
        };
        const clearIdPreview = () => {
          if (idPreviewUrl) {
            URL.revokeObjectURL(idPreviewUrl);
            idPreviewUrl = null;
          }
          $("#idPreview").removeAttr("src");
          $("#reviewIdPreview").removeAttr("src");
          $("#idPreviewWrap").addClass("d-none");
          $("#reviewIdPreviewWrap").addClass("d-none");
        };
        const clearVerificationResult = () => {
          $("#verificationResult").empty();
          $("#registrationDetails, #retrySelfieButton").addClass("d-none");
          setVerificationStatus("#faceProcessStatus", "");
        };
        const showVerificationResult = (success, message) => {
          const result = $("#verificationResult").empty();
          $("<i>", {
            class: `fa-solid ${success ? "fa-circle-check text-success" : "fa-circle-xmark text-danger"} fs-3 mb-2`,
          }).appendTo(result);
          $("<div>", { class: "fw-bold mb-1" })
            .text(
              success
                ? "Identity check passed"
                : "Verification needs another try",
            )
            .appendTo(result);
          $("<p>", { class: "small mb-0" }).text(message).appendTo(result);
          $("#registrationDetails").toggleClass("d-none", !success);
          $("#retrySelfieButton").toggleClass("d-none", success);
        };
        const resetVerificationSession = () => {
          verificationGeneration++;
          terminateOcrWorkers();
          releaseCamera();
          releaseIdCamera();
          clearCapturedSelfie();
          clearIdPreview();
          idFaceDescriptor = null;
          faceVerified = false;
          blinkProgress = { openFrames: 0, sawClosed: false, complete: false };
          $("#idImage").val("");
          $("#verificationConsent").prop("checked", false);
          $("#idImage, #startCameraButton, #startIdCameraButton").prop(
            "disabled",
            true,
          );
          setVerificationStatus("#idProcessStatus", "");
          setVerificationStatus("#idCameraStatus", "");
          setVerificationStatus(
            "#faceLiveStatus",
            "Start your camera when you’re ready.",
          );
          clearVerificationResult();
          setVerificationStep(1);
        };
        const loadFaceModels = async () => {
          if (!window.faceapi) {
            throw new Error(
              "Face verification library did not load. Check your internet connection and reload.",
            );
          }
          if (!faceapi.tf || typeof faceapi.tf.ready !== "function") {
            throw new Error(
              "Face verification runtime is unavailable. Reload the page and try again.",
            );
          }
          if (!faceModelsLoading) {
            faceModelsLoading = faceapi.tf
              .ready()
              .then(() =>
                Promise.all([
                  faceapi.nets.ssdMobilenetv1.loadFromUri(faceModelUrl),
                  faceapi.nets.faceLandmark68Net.loadFromUri(faceModelUrl),
                  faceapi.nets.faceRecognitionNet.loadFromUri(faceModelUrl),
                ]),
              )
              .catch((error) => {
                faceModelsLoading = null;
                throw error;
              });
          }
          await faceModelsLoading;
        };
        const recognizeFace = async (source) => {
          await loadFaceModels();
          const detections = await faceapi
            .detectAllFaces(
              source,
              new faceapi.SsdMobilenetv1Options({ minConfidence: 0.35 }),
            )
            .withFaceLandmarks()
            .withFaceDescriptors();
          if (detections.length !== 1) {
            throw new Error(
              detections.length === 0
                ? "No face was detected. Use a clear, front-facing image."
                : "More than one face was detected. Use an image showing only one face.",
            );
          }
          return {
            descriptor: detections[0].descriptor,
            box: detections[0].detection.box,
            landmarks: detections[0].landmarks,
          };
        };
        const getFacePositionMessage = (box, width, height, selfie = false) => {
          if (!width || !height) return "Waiting for a clear camera frame.";
          const centerX = (box.x + box.width / 2) / width;
          const centerY = (box.y + box.height / 2) / height;
          const faceWidth = box.width / width;
          const faceHeight = box.height / height;
          if (
            box.x < 0 ||
            box.y < 0 ||
            box.x + box.width > width ||
            box.y + box.height > height
          ) {
            return "Move back so your entire face stays inside the frame.";
          }
          if (selfie) {
            if (faceWidth < 0.14 || faceHeight < 0.28) {
              return "Move a little closer to the camera.";
            }
            if (faceWidth > 0.68 || faceHeight > 0.88) {
              return "Move a little farther from the camera.";
            }
            if (centerX < 0.32) return "Move your face slightly to the right.";
            if (centerX > 0.68) return "Move your face slightly to the left.";
            if (centerY < 0.32) return "Move your face slightly lower.";
            if (centerY > 0.68) return "Move your face slightly higher.";
          }
          return "";
        };
        const eyeAspectRatio = (eye) => {
          const distance = (first, second) =>
            Math.hypot(first.x - second.x, first.y - second.y);
          const horizontal = distance(eye[0], eye[3]);
          if (!horizontal) return 0;
          return (
            (distance(eye[1], eye[5]) + distance(eye[2], eye[4])) /
            (2 * horizontal)
          );
        };
        const extractIdFields = (text) => {
          const lines = text
            .split(/\r?\n/)
            .map((line) => line.replace(/\s+/g, " ").trim())
            .filter(Boolean);
          const labeled = (pattern) => {
            for (let index = 0; index < lines.length; index++) {
              const match = lines[index].match(pattern);
              if (!match) continue;
              const value = (match[1] || "").replace(/^[\s:.-]+/, "").trim();
              if (value) return value;
              if (
                lines[index + 1] &&
                !/^[\d<]/.test(lines[index + 1]) &&
                !/^(?:date of birth|birth date|date born|dob|address|residential address|place of residence|surname|last name|family name|given name|first name|middle name)\b/i.test(
                  lines[index + 1],
                )
              ) {
                return lines[index + 1];
              }
            }
            return "";
          };
          let fullName = labeled(/^(?:full\s*name|name)\s*[:\-]?\s*(.+)?$/i);
          if (!fullName) {
            const given = labeled(
              /^(?:given\s*name|first\s*name)\s*[:\-]?\s*(.+)?$/i,
            );
            const middle = labeled(/^(?:middle\s*name)\s*[:\-]?\s*(.+)?$/i);
            const family = labeled(
              /^(?:surname|last\s*name|family\s*name)\s*[:\-]?\s*(.+)?$/i,
            );
            fullName = [given, middle, family].filter(Boolean).join(" ");
          }
          const dateLabel =
            /^(?:date\s*of\s*birth|birth\s*date|date\s*born|dob)\s*[:\-]?\s*(.*)$/i;
          let dateOfBirth = "";
          const dateText = labeled(dateLabel);
          const isoDate = dateText.match(
            /\b(19\d{2}|20\d{2})[-/.](0?[1-9]|1[0-2])[-/.]([0-2]?\d|3[01])\b/,
          );
          const numericDate = dateText.match(
            /\b([0-3]?\d)[-/]([0-3]?\d)[-/](19\d{2}|20\d{2})\b/,
          );
          const namedDate = dateText.match(
            /\b([A-Za-z]{3,9})\s+([0-3]?\d),?\s+(19\d{2}|20\d{2})\b|\b([0-3]?\d)\s+([A-Za-z]{3,9})\s+(19\d{2}|20\d{2})\b/,
          );
          if (isoDate) {
            dateOfBirth = `${isoDate[1]}-${isoDate[2].padStart(2, "0")}-${isoDate[3].padStart(2, "0")}`;
          } else if (numericDate) {
            const first = Number(numericDate[1]);
            const second = Number(numericDate[2]);
            const month = first > 12 ? second : first;
            const day = first > 12 ? first : second;
            if (month <= 12 && day <= 31) {
              dateOfBirth = `${numericDate[3]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            }
          } else if (namedDate) {
            const monthNames = [
              "jan",
              "feb",
              "mar",
              "apr",
              "may",
              "jun",
              "jul",
              "aug",
              "sep",
              "oct",
              "nov",
              "dec",
            ];
            const monthName = (namedDate[1] || namedDate[5])
              .slice(0, 3)
              .toLowerCase();
            const month = monthNames.indexOf(monthName) + 1;
            const day = namedDate[2] || namedDate[4];
            const year = namedDate[3] || namedDate[6];
            if (month && Number(day) <= 31) {
              dateOfBirth = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            }
          }
          const address = labeled(
            /^(?:address|residential\s*address|place\s*of\s*residence)\s*[:\-]?\s*(.+)?$/i,
          );
          return { fullName, dateOfBirth, address };
        };
        const applyExtractedValue = (selector, label, value) => {
          if (!value) return;
          const input = $(selector).get(0);
          if (!input.value.trim()) {
            input.value = value;
            return;
          }
          if (
            input.value.trim().toLocaleLowerCase() !==
              value.toLocaleLowerCase() &&
            window.confirm(
              `The ID image shows "${value}" for ${label}. Replace the value you entered?`,
            )
          ) {
            input.value = value;
          }
        };

        $("#verificationConsent").on("change", function () {
          const allowed = this.checked;
          verificationGeneration++;
          $("#idImage, #startCameraButton, #startIdCameraButton").prop(
            "disabled",
            !allowed,
          );
          if (!allowed) {
            releaseIdCamera();
            $("#idImage").val("");
            idFaceDescriptor = null;
            faceVerified = false;
            clearCapturedSelfie();
            clearIdPreview();
            blinkProgress = {
              openFrames: 0,
              sawClosed: false,
              complete: false,
            };
            terminateOcrWorkers();
            setVerificationStatus("#idProcessStatus", "");
            setVerificationStatus(
              "#faceLiveStatus",
              "Start your camera when you’re ready.",
            );
            clearVerificationResult();
            setVerificationStep(1);
          }
        });

        const processIdImage = async (file) => {
          const generation = ++verificationGeneration;
          terminateOcrWorkers();
          releaseIdCamera();
          releaseCamera();
          idFaceDescriptor = null;
          faceVerified = false;
          clearCapturedSelfie();
          clearIdPreview();
          clearVerificationResult();
          setVerificationStep(1);
          if (!file) {
            setVerificationStatus("#idProcessStatus", "");
            return;
          }
          if (!$("#verificationConsent").prop("checked")) {
            $("#idImage").val("");
            setVerificationStatus(
              "#idProcessStatus",
              "Consent is required before processing the ID image.",
            );
            return;
          }
          if (
            !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
            file.size > maxIdentityImageBytes
          ) {
            $("#idImage").val("");
            setVerificationStatus(
              "#idProcessStatus",
              "Choose a JPEG, PNG, or WebP image no larger than 10 MB.",
            );
            return;
          }
          if (!window.Tesseract) {
            $("#idImage").val("");
            setVerificationStatus(
              "#idProcessStatus",
              "OCR could not start because its library did not load. Check your internet connection and reload.",
            );
            return;
          }

          idPreviewUrl = URL.createObjectURL(file);
          $("#idPreview").attr("src", idPreviewUrl);
          $("#idPreviewWrap").removeClass("d-none");
          setLoadingStatus(
            "#idProcessStatus",
            "Reading the ID and checking for one clear face…",
          );
          let worker;
          try {
            worker = await Tesseract.createWorker("eng", 1, {
              workerPath:
                "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js",
              corePath: "https://cdn.jsdelivr.net/npm/tesseract.js-core@5.0.0",
              langPath:
                "https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int",
            });
            activeOcrWorkers.add(worker);
            if (
              generation !== verificationGeneration ||
              !$("#verificationConsent").prop("checked")
            ) {
              return;
            }
            const { data } = await worker.recognize(file);
            if (!data.text || !data.text.trim()) {
              throw new Error(
                "No readable text was found. Try a sharper, well-lit image of the ID.",
              );
            }
            if (
              generation !== verificationGeneration ||
              !$("#verificationConsent").prop("checked")
            ) {
              return;
            }
            const fields = extractIdFields(data.text || "");
            const idPreview = $("#idPreview").get(0);
            if (!idPreview.complete) await idPreview.decode();
            const descriptor = await recognizeFace($("#idPreview").get(0));
            if (
              generation !== verificationGeneration ||
              !$("#verificationConsent").prop("checked")
            ) {
              return;
            }
            const facePositionMessage = getFacePositionMessage(
              descriptor.box,
              $("#idPreview").get(0).naturalWidth,
              $("#idPreview").get(0).naturalHeight,
            );
            if (facePositionMessage) {
              throw new Error(
                `The face in the ID image is too small or partly outside the frame. ${facePositionMessage}`,
              );
            }
            idFaceDescriptor = descriptor.descriptor;
            $("#reviewIdPreview").attr("src", idPreviewUrl);
            $("#reviewIdPreviewWrap").removeClass("d-none");
            applyExtractedValue("#regName", "full name", fields.fullName);
            applyExtractedValue("#regDob", "date of birth", fields.dateOfBirth);
            applyExtractedValue("#regAddress", "address", fields.address);
            const missing = [
              !fields.fullName && "name",
              !fields.dateOfBirth && "date of birth",
              !fields.address && "address",
            ].filter(Boolean);
            setVerificationStatus(
              "#idProcessStatus",
              `ID image is ready. Review the extracted details in the next step.${missing.length ? ` Could not confidently extract: ${missing.join(", ")}.` : ""}`,
              true,
            );
            setVerificationStatus(
              "#reviewIdStatus",
              `OCR suggestions loaded. Confirm or correct each field.${missing.length ? ` No confident text was found for: ${missing.join(", ")}.` : ""}`,
              true,
            );
            setVerificationStep(2);
          } catch (error) {
            idFaceDescriptor = null;
            if (generation !== verificationGeneration) return;
            setVerificationStatus("#reviewIdStatus", "");
            setVerificationStatus(
              "#idProcessStatus",
              error && error.message
                ? `ID could not be read or checked: ${error.message}`
                : "ID could not be read. Try a sharper, well-lit image.",
            );
          } finally {
            if (worker && activeOcrWorkers.delete(worker))
              await worker.terminate();
            $("#idImage").val("");
          }
        };

        $("#idImage").on("change", function () {
          const file = this.files && this.files[0];
          if (file) processIdImage(file);
        });

        $("#startIdCameraButton").on("click", async function () {
          if (!$("#verificationConsent").prop("checked")) {
            setVerificationStatus(
              "#idCameraStatus",
              "Consent is required before capturing an ID image.",
            );
            return;
          }
          if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            setVerificationStatus(
              "#idCameraStatus",
              "Camera access is unavailable. Open this page on HTTPS or localhost in a supported browser.",
            );
            return;
          }
          $(this).prop("disabled", true);
          const cameraGeneration = verificationGeneration;
          setLoadingStatus("#idCameraStatus", "Requesting camera access…");
          try {
            const stream = await navigator.mediaDevices.getUserMedia({
              audio: false,
              video: {
                facingMode: { ideal: "environment" },
                width: { ideal: 1280 },
                height: { ideal: 720 },
              },
            });
            if (
              cameraGeneration !== verificationGeneration ||
              !$("#verificationConsent").prop("checked") ||
              currentVerificationStep !== 1
            ) {
              stream.getTracks().forEach((track) => track.stop());
              return;
            }
            idCameraStream = stream;
            const video = $("#idCaptureVideo").get(0);
            video.srcObject = stream;
            await video.play();
            $("#idCaptureVideo").removeClass("d-none");
            $("#startIdCameraButton").addClass("d-none");
            $("#captureIdButton").removeClass("d-none").prop("disabled", false);
            setVerificationStatus(
              "#idCameraStatus",
              "Position the full ID inside the frame, then capture it.",
              true,
            );
          } catch (error) {
            releaseIdCamera();
            setVerificationStatus(
              "#idCameraStatus",
              error && error.name === "NotAllowedError"
                ? "Camera permission was denied. Allow camera access and try again."
                : error && error.name === "NotFoundError"
                  ? "No camera was found. Connect a camera and try again."
                  : error && error.message
                    ? `Could not start the ID camera: ${error.message}`
                    : "Could not start the camera. Check that it is connected and not in use by another app.",
            );
          } finally {
            $("#startIdCameraButton").prop(
              "disabled",
              !$("#verificationConsent").prop("checked"),
            );
          }
        });

        $("#captureIdButton").on("click", async function () {
          if (!idCameraStream) return;
          $(this).prop("disabled", true);
          const video = $("#idCaptureVideo").get(0);
          const canvas = document.createElement("canvas");
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          if (!canvas.width || !canvas.height) {
            setVerificationStatus(
              "#idCameraStatus",
              "The camera is not ready yet. Wait for the preview and try again.",
            );
            $("#captureIdButton").prop("disabled", false);
            return;
          }
          canvas.getContext("2d").drawImage(video, 0, 0);
          try {
            const image = await new Promise((resolve, reject) => {
              canvas.toBlob(
                (blob) => {
                  if (blob) resolve(blob);
                  else reject(new Error("The camera image could not be created."));
                },
                "image/jpeg",
                0.92,
              );
            });
            releaseIdCamera();
            await processIdImage(
              new File([image], "id-camera-capture.jpg", {
                type: "image/jpeg",
              }),
            );
          } catch (error) {
            setVerificationStatus(
              "#idCameraStatus",
              error && error.message
                ? `Could not capture the ID: ${error.message}`
                : "Could not capture the ID. Try again.",
            );
            $("#captureIdButton").prop("disabled", false);
          } finally {
            canvas.width = 0;
            canvas.height = 0;
          }
        });

        const monitorFaceGuide = async () => {
          if (!cameraStream || currentVerificationStep !== 3) return;
          if (faceMonitorBusy) {
            faceMonitorTimer = setTimeout(monitorFaceGuide, 250);
            return;
          }
          faceMonitorBusy = true;
          try {
            const video = $("#faceVideo").get(0);
            if (video.readyState >= 2) {
              const detections = await faceapi
                .detectAllFaces(
                  video,
                  new faceapi.SsdMobilenetv1Options({ minConfidence: 0.4 }),
                )
                .withFaceLandmarks();
              if (
                !cameraStream ||
                currentVerificationStep !== 3 ||
                !$("#verificationConsent").prop("checked")
              ) {
                return;
              }
              if (detections.length !== 1) {
                $("#faceGuide").removeClass("is-aligned");
                $("#captureFaceButton").prop("disabled", true);
                blinkProgress = {
                  openFrames: 0,
                  sawClosed: false,
                  complete: false,
                };
                setVerificationStatus(
                  "#faceLiveStatus",
                  detections.length === 0
                    ? "Move into the oval and face the camera."
                    : "Only one face should be visible. Ask others to step out of frame.",
                );
              } else {
                const detection = detections[0];
                const positionMessage = getFacePositionMessage(
                  detection.detection.box,
                  video.videoWidth,
                  video.videoHeight,
                  true,
                );
                if (positionMessage) {
                  $("#faceGuide").removeClass("is-aligned");
                  $("#captureFaceButton").prop("disabled", true);
                  blinkProgress = {
                    openFrames: 0,
                    sawClosed: false,
                    complete: false,
                  };
                  setVerificationStatus(
                    "#faceLiveStatus",
                    positionMessage,
                    true,
                  );
                } else {
                  $("#faceGuide").addClass("is-aligned");
                  const landmarks = detection.landmarks;
                  const leftEye = eyeAspectRatio(landmarks.getLeftEye());
                  const rightEye = eyeAspectRatio(landmarks.getRightEye());
                  const eyesOpen = leftEye > 0.22 && rightEye > 0.22;
                  const eyesClosed = leftEye < 0.18 && rightEye < 0.18;
                  if (!blinkProgress.complete) {
                    if (blinkProgress.sawClosed && eyesOpen) {
                      blinkProgress.complete = true;
                    } else if (blinkProgress.openFrames >= 2 && eyesClosed) {
                      blinkProgress.sawClosed = true;
                    } else if (eyesOpen) {
                      blinkProgress.openFrames++;
                    }
                  }
                  $("#captureFaceButton").prop(
                    "disabled",
                    !blinkProgress.complete,
                  );
                  setVerificationStatus(
                    "#faceLiveStatus",
                    blinkProgress.complete
                      ? "Face is centered and the blink check passed. Capture your selfie when ready."
                      : blinkProgress.sawClosed
                        ? "Blink detected. Open your eyes to finish the check."
                        : blinkProgress.openFrames >= 2
                          ? "Face centered. Blink once to continue."
                          : "Face detected. Hold still, look at the camera, and keep your eyes open.",
                    blinkProgress.complete,
                  );
                }
              }
            }
          } catch (error) {
            releaseCamera();
            setVerificationStatus(
              "#faceLiveStatus",
              error && error.message
                ? `Could not check the camera image: ${error.message}`
                : "Could not check the camera image. Restart the camera and try again.",
            );
          } finally {
            faceMonitorBusy = false;
            if (cameraStream && currentVerificationStep === 3) {
              faceMonitorTimer = setTimeout(monitorFaceGuide, 300);
            }
          }
        };

        $("#continueToSelfieButton").on("click", function () {
          const name = $("#regName").val().trim().replace(/\s+/g, " ");
          if (!/^\p{L}+(?:[ '\u2019.-]\p{L}+)*$/u.test(name)) {
            setErr(
              "#regNameErr",
              name
                ? "Enter a valid name using letters and common name separators."
                : "Full name is required.",
            );
            return;
          }
          setErr("#regNameErr", "");
          clearCapturedSelfie();
          blinkProgress = { openFrames: 0, sawClosed: false, complete: false };
          setVerificationStatus(
            "#faceLiveStatus",
            "Start your camera when you’re ready.",
          );
          setVerificationStep(3);
        });

        $("[data-step-back]").on("click", function () {
          const destination = Number(this.dataset.stepBack);
          if (destination === 3) {
            clearCapturedSelfie();
            faceVerified = false;
            blinkProgress = {
              openFrames: 0,
              sawClosed: false,
              complete: false,
            };
            setVerificationStatus(
              "#faceLiveStatus",
              "Start your camera to retake your selfie.",
            );
          }
          if (destination === 1) {
            setVerificationStep(1);
            $("#idImage").trigger("focus");
          } else {
            setVerificationStep(destination);
          }
        });

        $("#startCameraButton").on("click", async function () {
          if (!$("#verificationConsent").prop("checked") || !idFaceDescriptor) {
            setVerificationStatus(
              "#faceLiveStatus",
              "Upload and review a readable ID before starting the selfie check.",
            );
            return;
          }
          if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            setVerificationStatus(
              "#faceLiveStatus",
              "Camera access is unavailable. Open this page on HTTPS or localhost in a supported browser.",
            );
            return;
          }
          $(this).prop("disabled", true);
          const cameraGeneration = verificationGeneration;
          setLoadingStatus(
            "#faceLiveStatus",
            "Loading the face check and requesting camera access…",
          );
          try {
            await loadFaceModels();
            if (
              cameraGeneration !== verificationGeneration ||
              !$("#verificationConsent").prop("checked") ||
              currentVerificationStep !== 3
            ) {
              return;
            }
            const stream = await navigator.mediaDevices.getUserMedia({
              audio: false,
              video: {
                facingMode: "user",
                width: { ideal: 1280 },
                height: { ideal: 720 },
              },
            });
            if (
              cameraGeneration !== verificationGeneration ||
              !$("#verificationConsent").prop("checked") ||
              currentVerificationStep !== 3
            ) {
              stream.getTracks().forEach((track) => track.stop());
              return;
            }
            cameraStream = stream;
            const video = $("#faceVideo").get(0);
            video.srcObject = cameraStream;
            await video.play();
            $("#faceVideo, #faceGuide").removeClass("d-none");
            $("#startCameraButton").addClass("d-none");
            $("#captureFaceButton")
              .removeClass("d-none")
              .prop("disabled", true);
            blinkProgress = {
              openFrames: 0,
              sawClosed: false,
              complete: false,
            };
            setVerificationStatus(
              "#faceLiveStatus",
              "Position your face inside the oval.",
            );
            monitorFaceGuide();
          } catch (error) {
            releaseCamera();
            setVerificationStatus(
              "#faceLiveStatus",
              error && error.name === "NotAllowedError"
                ? "Camera permission was denied. Allow camera access and try again."
                : error && error.name === "NotFoundError"
                  ? "No camera was found. Connect a camera and try again."
                  : error && error.message
                    ? `Could not start the face check: ${error.message}`
                    : "Could not start the camera. Check that it is connected and not in use by another app.",
            );
          } finally {
            $("#startCameraButton").prop(
              "disabled",
              !$("#verificationConsent").prop("checked") || !idFaceDescriptor,
            );
          }
        });

        $("#captureFaceButton").on("click", async function () {
          if (!cameraStream || !idFaceDescriptor || !blinkProgress.complete) {
            setVerificationStatus(
              "#faceLiveStatus",
              "Complete the face-position and blink checks before capturing.",
            );
            return;
          }
          $(this).prop("disabled", true);
          const captureGeneration = verificationGeneration;
          setLoadingStatus("#faceLiveStatus", "Capturing your selfie…");
          clearCapturedSelfie();
          let capturedFrame;
          try {
            const video = $("#faceVideo").get(0);
            capturedFrame = $("#selfiePreview").get(0);
            capturedFrame.width = video.videoWidth;
            capturedFrame.height = video.videoHeight;
            capturedFrame
              .getContext("2d")
              .drawImage(
                video,
                0,
                0,
                capturedFrame.width,
                capturedFrame.height,
              );
            const result = await recognizeFace(capturedFrame);
            if (
              captureGeneration !== verificationGeneration ||
              !$("#verificationConsent").prop("checked")
            ) {
              capturedFrame.width = 0;
              capturedFrame.height = 0;
              return;
            }
            const positionMessage = getFacePositionMessage(
              result.box,
              capturedFrame.width,
              capturedFrame.height,
              true,
            );
            if (positionMessage) {
              capturedFrame.width = 0;
              capturedFrame.height = 0;
              setVerificationStatus(
                "#faceLiveStatus",
                `${positionMessage} Keep your face centered and capture again.`,
              );
              return;
            }
            capturedSelfieCanvas = capturedFrame;
            capturedSelfieDescriptor = result.descriptor;
            $("#selfiePreviewWrap").removeClass("d-none");
            setVerificationStatus(
              "#faceLiveStatus",
              "Selfie captured. Review it, then continue to verify.",
              true,
            );
            setVerificationStep(4);
          } catch (error) {
            if (capturedFrame) {
              capturedFrame.width = 0;
              capturedFrame.height = 0;
            }
            setVerificationStatus(
              "#faceLiveStatus",
              error && error.message
                ? `Selfie could not be checked: ${error.message}`
                : "Selfie could not be checked. Try again in better lighting.",
            );
          } finally {
            $("#captureFaceButton").prop("disabled", false);
          }
        });

        $("#verifyIdentityButton").on("click", async function () {
          if (
            !$("#verificationConsent").prop("checked") ||
            !idFaceDescriptor ||
            !capturedSelfieDescriptor
          ) {
            faceVerified = false;
            showVerificationResult(
              false,
              "The ID or selfie is no longer available. Retake the selfie and try again.",
            );
            setVerificationStep(5);
            return;
          }
          $(this).prop("disabled", true);
          const verificationAttemptGeneration = verificationGeneration;
          setLoadingStatus(
            "#faceProcessStatus",
            "Comparing the selfie with the face on your ID…",
          );
          try {
            await loadFaceModels();
            if (
              verificationAttemptGeneration !== verificationGeneration ||
              !$("#verificationConsent").prop("checked")
            ) {
              return;
            }
            const distance = faceapi.euclideanDistance(
              idFaceDescriptor,
              capturedSelfieDescriptor,
            );
            faceVerified = distance <= 0.6;
            if (faceVerified) {
              showVerificationResult(
                true,
                "The face match and basic blink check passed on this device. This browser-only prototype cannot prove identity or securely enforce verification.",
              );
              clearCapturedSelfie();
              idFaceDescriptor = null;
              clearIdPreview();
            } else {
              showVerificationResult(
                false,
                "The faces did not match closely enough. Check that the ID is yours, use a clear ID portrait, and retake your selfie in good lighting.",
              );
              clearCapturedSelfie();
            }
          } catch (error) {
            if (verificationAttemptGeneration !== verificationGeneration)
              return;
            faceVerified = false;
            showVerificationResult(
              false,
              error && error.message
                ? `The face comparison could not be completed: ${error.message}`
                : "The face comparison could not be completed. Check your connection and try again.",
            );
            clearCapturedSelfie();
          } finally {
            $(this).prop("disabled", false);
            setVerificationStep(5);
          }
        });

        $("#retrySelfieButton").on("click", function () {
          faceVerified = false;
          clearCapturedSelfie();
          blinkProgress = { openFrames: 0, sawClosed: false, complete: false };
          clearVerificationResult();
          setVerificationStatus(
            "#faceLiveStatus",
            "Start your camera to retake your selfie.",
          );
          setVerificationStep(3);
        });
        $("#registerForm").on("submit", function (e) {
          e.preventDefault();
          if (
            !faceVerified ||
            currentVerificationStep !== 5 ||
            !$("#verificationConsent").prop("checked")
          ) {
            faceVerified = false;
            setVerificationStep(5);
            showVerificationResult(
              false,
              "Complete the ID and live-selfie check successfully before creating an account.",
            );
            return;
          }
          const name = $("#regName").val().trim().replace(/\s+/g, " "),
            user = $("#regUser").val().trim(),
            phone = $("#regPhone").val();
          const pass = $("#regPassword").val(),
            conf = $("#regConfirm").val();
          let ok = true;
          if (!/^\p{L}+(?:[ '\u2019.-]\p{L}+)*$/u.test(name)) {
            setErr(
              "#regNameErr",
              name
                ? "Enter a valid name using letters and common name separators."
                : "Full name is required.",
            );
            ok = false;
          } else setErr("#regNameErr", "");
          if (!user) {
            setErr("#regUserErr", "Username / Name is required.");
            ok = false;
          } else if (
            registeredUsers.some(
              (u) => u.username.toLowerCase() === user.toLowerCase(),
            )
          ) {
            setErr("#regUserErr", "That username / name is already taken.");
            ok = false;
          } else setErr("#regUserErr", "");
          if (!/^\d{11}$/.test(phone)) {
            setErr("#regPhoneErr", "Phone number must be exactly 11 digits.");
            ok = false;
          } else setErr("#regPhoneErr", "");
          if (!pass) {
            setErr("#regPassErr", "Password is required.");
            ok = false;
          } else setErr("#regPassErr", "");
          if (pass && pass !== conf) {
            setErr("#regConfErr", "Password not match");
            ok = false;
          } else if (!conf) {
            setErr("#regConfErr", "Please confirm your password.");
            ok = false;
          } else setErr("#regConfErr", "");
          if (!ok) return;
          const nu = {
            username: user,
            password: pass,
            role: "Guest",
            name: name,
            phone: phone,
            dateOfBirth: $("#regDob").val(),
            address: $("#regAddress").val().trim(),
            identityVerified: true,
          };
          try {
            window.DJSALON_AUTH.saveUser(nu);
          } catch (error) {
            showVerificationResult(
              false,
              error && error.message
                ? `Account could not be saved: ${error.message}`
                : "Account could not be saved in this browser. Check available storage and try again.",
            );
            return;
          }
          try {
            window.DJSALON_AUTH.setCurrentUser(nu);
          } catch (error) {
            showVerificationResult(
              false,
              error && error.message
                ? `Your account was created, but sign-in could not be saved: ${error.message}`
                : "Your account was created, but automatic sign-in could not be saved. Sign in from the login page.",
            );
            return;
          }
          resetVerificationSession();
          window.location.assign("index%20.html");
        });
  window.addEventListener("pagehide", resetVerificationSession);
});
