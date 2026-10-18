$(document).ready(function () {
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
        $("#regUser, #regPhone, #regPassword, #regConfirm").on(
          "input",
          () => $("#registrationSaveStatus").addClass("d-none").text(""),
        );
        const faceModelUrl =
          "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/model";
        const maxIdentityImageBytes = 10 * 1024 * 1024;
        let idFaceDescriptor = null;
        let faceVerified = false;
        let registeredFaceDescriptor = null;
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
        let stableFace = { samples: 0, box: null, since: 0 };
        let selfieCaptureInProgress = false;
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
          stableFace = { samples: 0, box: null, since: 0 };
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
        const waitForVideoFrame = (video, stream) =>
          new Promise((resolve, reject) => {
            let timeout;
            const cleanup = () => {
              clearTimeout(timeout);
              video.removeEventListener("loadedmetadata", checkReady);
              video.removeEventListener("loadeddata", checkReady);
              video.removeEventListener("canplay", checkReady);
              video.removeEventListener("error", handleError);
            };
            const handleError = () => {
              cleanup();
              reject(new Error("The camera preview could not be loaded."));
            };
            const checkReady = () => {
              if (!stream.getVideoTracks().some((track) => track.readyState === "live")) {
                cleanup();
                reject(new Error("The camera stream ended before a frame was ready."));
                return;
              }
              if (
                video.readyState >= 2 &&
                video.videoWidth > 0 &&
                video.videoHeight > 0
              ) {
                cleanup();
                resolve();
              }
            };
            video.addEventListener("loadedmetadata", checkReady);
            video.addEventListener("loadeddata", checkReady);
            video.addEventListener("canplay", checkReady);
            video.addEventListener("error", handleError);
            timeout = setTimeout(() => {
              cleanup();
              reject(new Error("The camera did not provide a usable video frame."));
            }, 10000);
            checkReady();
          });
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
          registeredFaceDescriptor = null;
          stableFace = { samples: 0, box: null, since: 0 };
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
            stableFace = { samples: 0, box: null, since: 0 };
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
            await waitForVideoFrame(video, stream);
            if (
              cameraGeneration !== verificationGeneration ||
              currentVerificationStep !== 1
            ) {
              releaseIdCamera();
              return;
            }
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

        const captureStableSelfie = async () => {
          if (
            selfieCaptureInProgress ||
            !cameraStream ||
            !idFaceDescriptor ||
            currentVerificationStep !== 3
          ) {
            return;
          }
          selfieCaptureInProgress = true;
          $("#captureFaceButton").prop("disabled", true).text("Capturing selfie…");
          setVerificationStatus(
            "#faceLiveStatus",
            "Face is stable. Capturing your selfie…",
            true,
          );
          const captureGeneration = verificationGeneration;
          clearCapturedSelfie();
          let capturedFrame;
          try {
            const video = $("#faceVideo").get(0);
            if (
              !cameraStream
                .getVideoTracks()
                .some((track) => track.readyState === "live") ||
              video.readyState < 2 ||
              !video.videoWidth ||
              !video.videoHeight
            ) {
              throw new Error(
                "Wait for an active camera frame before capturing.",
              );
            }
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
              !$("#verificationConsent").prop("checked") ||
              currentVerificationStep !== 3
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
              stableFace = { samples: 0, box: null, since: 0 };
              setVerificationStatus(
                "#faceLiveStatus",
                `${positionMessage} Hold still for automatic capture.`,
                true,
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
            stableFace = { samples: 0, box: null, since: 0 };
            releaseCamera();
            setVerificationStatus(
              "#faceLiveStatus",
              error && error.message
                ? `Selfie could not be checked: ${error.message}`
                : "Selfie could not be checked. Try again in better lighting.",
            );
          } finally {
            selfieCaptureInProgress = false;
            if (currentVerificationStep === 3 && cameraStream) {
              $("#captureFaceButton")
                .prop("disabled", true)
                .text("Hold still for capture");
            }
          }
        };

        const monitorFaceGuide = async () => {
          if (!cameraStream || currentVerificationStep !== 3) return;
          if (faceMonitorBusy || selfieCaptureInProgress) {
            faceMonitorTimer = setTimeout(monitorFaceGuide, 50);
            return;
          }
          faceMonitorBusy = true;
          try {
            const video = $("#faceVideo").get(0);
            if (
              video.readyState < 2 ||
              !video.videoWidth ||
              !video.videoHeight
            ) {
              stableFace = { samples: 0, box: null, since: 0 };
              setVerificationStatus(
                "#faceLiveStatus",
                "Waiting for a usable camera frame…",
              );
              return;
            }
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
              stableFace = { samples: 0, box: null, since: 0 };
              $("#faceGuide").removeClass("is-aligned");
              setVerificationStatus(
                "#faceLiveStatus",
                detections.length === 0
                  ? "Move into the oval and face the camera."
                  : "Only one face should be visible. Ask others to step out of frame.",
              );
              return;
            }
            const box = detections[0].detection.box;
            const positionMessage = getFacePositionMessage(
              box,
              video.videoWidth,
              video.videoHeight,
              true,
            );
            if (positionMessage) {
              stableFace = { samples: 0, box: null, since: 0 };
              $("#faceGuide").removeClass("is-aligned");
              setVerificationStatus(
                "#faceLiveStatus",
                positionMessage,
                true,
              );
              return;
            }
            $("#faceGuide").addClass("is-aligned");
            const currentBox = {
              centerX: (box.x + box.width / 2) / video.videoWidth,
              centerY: (box.y + box.height / 2) / video.videoHeight,
              width: box.width / video.videoWidth,
              height: box.height / video.videoHeight,
            };
            const previousBox = stableFace.box;
            const stable =
              previousBox &&
              Math.abs(currentBox.centerX - previousBox.centerX) <= 0.025 &&
              Math.abs(currentBox.centerY - previousBox.centerY) <= 0.025 &&
              Math.abs(currentBox.width - previousBox.width) <= 0.06 &&
              Math.abs(currentBox.height - previousBox.height) <= 0.06;
            if (stable) {
              stableFace.samples++;
            } else {
              stableFace = {
                samples: 1,
                box: currentBox,
                since: Date.now(),
              };
            }
            stableFace.box = currentBox;
            $("#captureFaceButton")
              .prop("disabled", true)
              .text("Hold still for capture");
            if (
              stableFace.samples >= 8 &&
              Date.now() - stableFace.since >= 600
            ) {
              await captureStableSelfie();
            } else {
              setVerificationStatus(
                "#faceLiveStatus",
                "Face is centered. Hold still for automatic capture.",
                true,
              );
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
              faceMonitorTimer = setTimeout(monitorFaceGuide, 50);
            }
          }
        };

        $("#continueToSelfieButton").on("click", function () {
          const name = $("#regName").val().trim().replace(/\s+/g, " ");
          if (
            !$("#verificationConsent").prop("checked") ||
            !idFaceDescriptor ||
            !$("#reviewIdPreview").attr("src")
          ) {
            setVerificationStatus(
              "#idProcessStatus",
              "Upload and review a readable ID image before continuing.",
            );
            setVerificationStep(1);
            return;
          }
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
          stableFace = { samples: 0, box: null, since: 0 };
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
            stableFace = { samples: 0, box: null, since: 0 };
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
            await waitForVideoFrame(video, stream);
            if (
              cameraGeneration !== verificationGeneration ||
              !$("#verificationConsent").prop("checked") ||
              currentVerificationStep !== 3
            ) {
              releaseCamera();
              return;
            }
            $("#faceVideo, #faceGuide").removeClass("d-none");
            $("#startCameraButton").addClass("d-none");
            $("#captureFaceButton")
              .removeClass("d-none")
              .prop("disabled", true)
              .text("Hold still for capture");
            stableFace = { samples: 0, box: null, since: 0 };
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
              registeredFaceDescriptor = Array.from(capturedSelfieDescriptor);
              showVerificationResult(
                true,
                "The face match passed on this device. Automatic capture does not prove liveness; production use requires additional anti-spoofing protection. This browser-only prototype cannot securely enforce verification.",
              );
              clearCapturedSelfie();
              idFaceDescriptor = null;
              clearIdPreview();
            } else {
              registeredFaceDescriptor = null;
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
            registeredFaceDescriptor = null;
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
          stableFace = { samples: 0, box: null, since: 0 };
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
            !registeredFaceDescriptor ||
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
            window.DJSALON_AUTH.getUsers().some(
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
          } else if (pass.length < 8) {
            setErr("#regPassErr", "Password must be at least 8 characters.");
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
            active: true,
            faceDescriptor: registeredFaceDescriptor,
          };
          try {
            window.DJSALON_AUTH.saveUser(nu);
          } catch (error) {
            if (error && /already taken/i.test(error.message || "")) {
              setErr("#regUserErr", "That username / name is already taken.");
              return;
            }
            $("#registrationSaveStatus")
              .text(
                error && error.message
                  ? `Account could not be saved: ${error.message}`
                  : "Account could not be saved in this browser. Check available storage and try again.",
              )
              .removeClass("d-none");
            return;
          }
          resetVerificationSession();
          window.location.assign("login.html?registered=1");
        });
  window.addEventListener("pagehide", resetVerificationSession);
});
