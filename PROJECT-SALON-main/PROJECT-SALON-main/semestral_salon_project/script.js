// --- ACCOUNTS REGISTRY ---
      const registeredUsers = window.DJSALON_AUTH.getUsers();
      let currentUser = window.DJSALON_AUTH.getCurrentUser();

      let servicesData = [
        {
          id: 1,
          active: true,
          title: "Hair Cutting",
          price: 350,
          desc: "Tailored haircut, wash, scalp conditioning massage, and custom styling.",
          img: "https://images.unsplash.com/photo-1562322140-8baeececf3df?auto=format&fit=crop&w=600&q=80",
        },
        {
          id: 2,
          active: true,
          title: "Hair Coloring",
          price: 1500,
          desc: "Full color, balayage or highlights with a glossy finish.",
          img: "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=600&q=80",
        },
        {
          id: 3,
          active: true,
          title: "Manicure",
          price: 450,
          desc: "Nail shaping, cuticle care, pink scrub massage, and gel polish.",
          img: "https://images.unsplash.com/photo-1604654894610-df63bc536371?auto=format&fit=crop&w=600&q=80",
        },
      ];

      let reviewsData = [
        {
          name: "Chloe M.",
          station: "Station 01",
          rating: 5,
          comment:
            "DJ Salon is stunning! Pressed the button for a rose-tea add-on and my stylist brought it immediately.",
        },
        {
          name: "Daniel K.",
          station: "Station 02",
          rating: 5,
          comment:
            "Loved the convenience of paying at my seat using the bill request button.",
        },
      ];

      function peso(n) {
        return (
          "₱" +
          Number(n).toLocaleString("en-PH", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })
        );
      }

      let activeIoTRequests = [];
      const BOOKINGS_KEY = "djsalon_bookings";
      function loadBookings() {
        try {
          return JSON.parse(localStorage.getItem(BOOKINGS_KEY)) || [];
        } catch (e) {
          return [];
        }
      }
      function saveBookings() {
        try {
          localStorage.setItem(BOOKINGS_KEY, JSON.stringify(bookings));
        } catch (e) {}
      }
      let bookings = loadBookings(); // service requests: Pending / Accepted / Rejected
      let totalSignalsCount = 18;

      // --- WORKSPACE STATE (staff / owner) ---
      const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
      let schedules = [
        {
          user: "staff",
          days: ["Mon", "Tue", "Wed", "Thu", "Fri"],
          start: "09:00",
          end: "18:00",
          station: "Station 01",
        },
      ];
      const WS_TABS = {
        Staff: [
          ["notifs", "Console", "fa-gauge"],
          ["payments", "Payments", "fa-credit-card"],
          ["services", "Manage Services", "fa-list-check"],
          ["schedules", "Staff Schedules", "fa-calendar-days"],
          ["analytics", "Analytics & Feedback", "fa-chart-line"],
        ],
        Owner: [
          ["services", "Services", "fa-scissors"],
          ["staff", "Staff", "fa-users"],
          ["reports", "Reports", "fa-chart-pie"],
          ["settings", "Settings", "fa-gear"],
        ],
      };
      let custPane = "overview",
        custStation = "Station 01",
        custFilter = "All";
      let wsTab = null,
        repTab = "staffperf",
        charts = [];
      const esc = (s) =>
        String(s == null ? "" : s).replace(
          /[&<>"']/g,
          (c) =>
            ({
              "&": "&amp;",
              "<": "&lt;",
              ">": "&gt;",
              '"': "&quot;",
              "'": "&#39;",
            })[c],
        );
      const today = () => new Date().toLocaleDateString("en-CA");
      const shortName = (n) => String(n).replace(/\s*\(.*\)\s*$/, "");

      $(document).ready(function () {
        renderServices();
        renderReviews();

        window.logout = function () {
          new bootstrap.Modal(document.getElementById("logoutModal")).show();
        };

        window.confirmLogout = function () {
          const m = bootstrap.Modal.getInstance(
            document.getElementById("logoutModal"),
          );
          if (m) m.hide();
          currentUser = null;
          window.DJSALON_AUTH.clearCurrentUser();
          updateAuthUI();
        };

        function updateAuthUI() {
          const role = currentUser ? currentUser.role : null;
          const staffy = role === "Owner" || role === "Staff";
          $("body").toggleClass("role-staffy", staffy);
          $("#navStationBtn").toggleClass("d-none", role !== "Guest");
          $("#navMyBookingsBtn").toggleClass("d-none", role !== "Guest");
          $("#roleNav, #workspace").toggleClass("d-none", !staffy);
          $("body").toggleClass("in-app", !!currentUser);
          $("#appShell").toggleClass("d-none", !currentUser);
          $(".customer-only, .cp").removeClass("pane-on");
          updateNotifBadge();

          if (staffy) {
            if (!WS_TABS[role].some((t) => t[0] === wsTab))
              wsTab = role === "Owner" ? "reports" : "notifs";
            buildRoleNav();
            renderWs();
          } else {
            wsTab = null;
          }

          if (currentUser) {
            const roleLabel = role === "Guest" ? "Customer" : role;
            $("#authNavContainer").html(`
                        <div class="dropdown">
                            <button class="btn user-pill dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false">
                                <i class="fa-solid fa-user me-1 text-pink"></i> ${esc(shortName(currentUser.name))}
                            </button>
                            <ul class="dropdown-menu dropdown-menu-dark dropdown-menu-end">
                                <li><span class="dropdown-item-text small text-white-50">Signed in as <strong class="text-pink">${roleLabel}</strong></span></li>
                                <li><hr class="dropdown-divider"></li>
                                <li><button class="dropdown-item text-danger" type="button" onclick="logout()"><i class="fa-solid fa-right-from-bracket me-2"></i>Logout</button></li>
                            </ul>
                        </div>
                    `);
          } else {
            $("#authNavContainer").html(`
                        <a class="btn btn-sm btn-outline-light rounded-pill px-3" href="login.html"><i class="fa-solid fa-user-lock me-1 text-pink"></i> Login</a>
                    `);
          }
          if (currentUser) {
            $("#tbRole").text(
              "Signed in as " + (role === "Guest" ? "Customer" : role),
            );
            $("#tbTitle").text(role === "Owner" ? "Owner Hub" : "My DJ Salon");
            $("#sideTitle").text(
              role === "Owner" ? "Owner Hub" : "My DJ Salon",
            );
            if (role === "Guest") showPane("overview");
            else buildSide();
          }
          window.scrollTo(0, 0);
        }

        // --- PROTECTED ACTION NAVIGATION ---
        window.openStationBox = function () {
          if (!currentUser) {
            alert("Please log in first to access your Station Button Box.");
            window.location.assign("login.html");
            return;
          }
          const modal = new bootstrap.Modal(
            document.getElementById("iotSimulatorModal"),
          );
          modal.show();
        };

        window.openStaffHub = function () {
          if (!currentUser || currentUser.role !== "Staff") return;
          new bootstrap.Offcanvas(
            document.getElementById("staffDashboard"),
          ).show();
        };

        // --- RENDER FUNCTIONS ---
        function renderServices() {
          const grid = $("#servicesGrid");
          grid.empty();
          servicesData
            .filter((s) => s.active !== false)
            .forEach((s) => {
              const fallbackImg =
                s.img ||
                "https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=600&q=80";
              const safeTitle = s.title.replace(/'/g, "\\'");
              grid.append(`
                        <div class="col-md-4">
                            <div class="card service-card h-100">
                                <div class="service-img-wrapper">
                                    <img src="${fallbackImg}" alt="${s.title}" onerror="this.src='https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=600&q=80'">
                                    <div class="price-tag">${peso(s.price)}</div>
                                </div>
                                <div class="card-body d-flex flex-column justify-content-between p-4">
                                    <div>
                                        <h4 class="fw-bold font-heading mb-2">${s.title}</h4>
                                        <p class="text-muted small">${s.desc}</p>
                                    </div>
                                    <div class="d-grid gap-2 mt-3">
                                        <button class="btn btn-pink" onclick="availService(${s.id})">
                                            <i class="fa-solid fa-calendar-check me-1"></i> Avail Service
                                        </button>
                                        <button class="btn btn-outline-pink" onclick="openAddonPicker(${s.id})">
                                            <i class="fa-solid fa-plus me-1"></i> Request Add-on
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    `);
            });
        }

        // =============== WORKSPACE (STAFF + OWNER) ===============
        function isOwner() {
          return currentUser && currentUser.role === "Owner";
        }
        const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
        const tbl = (heads, rows, empty) =>
          rows.length
            ? `<div class="table-responsive"><table class="table table-sm table-hover align-middle mb-0 tbl-compact"><thead class="table-light"><tr>${heads.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`
            : `<div class="text-muted small py-3 text-center">${empty}</div>`;

        // =============== APP SHELL + NEW PANES ===============
        const CUST_TABS = [
          ["overview", "Overview", "fa-house"],
          ["bookings", "My Bookings", "fa-calendar-check"],
          ["services", "Signature Services", "fa-scissors"],
          ["station", "Station Button Box", "fa-microchip"],
          ["offers", "Offers", "fa-tag"],
          ["feedback", "Guest Feedback", "fa-star"],
        ];
        const PANE_EL = {
          overview: "#custOverview",
          bookings: "#custBookings",
          services: "#services",
          station: "#custStation",
          offers: "#promotions",
          feedback: "#feedback",
        };
        const STN = {
          "Station 01": "Styling Chair A",
          "Station 02": "Styling Chair B",
          "Station 03": "Wash Basin Unit",
        };

        function buildSide() {
          if (!currentUser) return;
          const role = currentUser.role,
            guest = role === "Guest";
          const tabs = guest ? CUST_TABS : WS_TABS[role],
            cur = guest ? custPane : wsTab;
          $("#sideNav").html(
            tabs
              .map(
                ([k, l, ic]) =>
                  `<button class="side-link ${cur === k ? "active" : ""}" onclick="${guest ? `showPane('${k}')` : `openWs('${k}')`}"><i class="fa-solid ${ic}" style="width:18px"></i>${l}${k === "notifs" ? '<span id="navTaskBadge" class="badge rounded-pill bg-danger ms-auto d-none"></span>' : ""}</button>`,
              )
              .join(""),
          );
          const nm = shortName(currentUser.name),
            sub = guest
              ? "Customer / Guest"
              : role === "Owner"
                ? "Salon administrator"
                : "Salon’s Staff";
          $("#sideUser").html(
            `${guest ? '<div class="side-card mb-3"><i class="fa-solid fa-sparkles text-pink"></i><div class="small mt-1">A little luxury, at your fingertips.</div></div>' : ""}<div class="d-flex align-items-center gap-2 mb-2"><span class="avatar">${esc(nm.charAt(0).toUpperCase())}</span><div class="lh-sm"><div class="fw-semibold small">${esc(nm)}</div><small class="text-white-50">${sub}</small></div></div><button class="side-link mb-0" onclick="logout()"><i class="fa-solid fa-right-from-bracket" style="width:18px"></i>Sign out</button>`,
          );
          $("#sideBar").removeClass("open");
          $("#tbTitle").text((tabs.find((t) => t[0] === cur) || [])[1] || "");
          $("#tbName").text(nm);
          $("#tbAvatar").text(nm.charAt(0).toUpperCase());
          if (!guest) updateTaskBadge();
        }

        window.showPane = function (k) {
          custPane = k;
          $(".customer-only, .cp").removeClass("pane-on");
          $(PANE_EL[k]).addClass("pane-on");
          if (k === "bookings") {
            bookings.forEach((b) => {
              if (b.customer === currentUser.name) {
                b.seen = true;
                b.paySeen = true;
              }
            });
            saveBookings();
          }
          buildSide();
          renderCust();
          updateNotifBadge();
          window.scrollTo(0, 0);
        };
        updateAuthUI();

        window.bellGo = function () {
          if (currentUser.role === "Guest") showPane("bookings");
          else openWs("notifs");
        };
        window.stationReq = function (type, css) {
          triggerIoTRequest(type, css, custStation);
          showToast("Request sent", `${type} sent from ${custStation}.`, true);
        };
        window.setStation = function (k) {
          custStation = k;
          renderCust();
        };
        window.setCbFilter = function (f) {
          custFilter = f;
          renderCust();
        };

        function renderCustBase() {
          if (!currentUser || currentUser.role !== "Guest") return;
          const mine = bookings.filter((b) => b.customer === currentUser.name);
          const cnt = (s) => mine.filter((b) => b.status === s).length,
            paid = mine.filter((b) => b.paid);
          const n = unseenUpdates().length,
            one = (c, a, b) => `${c} ${c === 1 ? a : b}`;
          $("#custWelcome").text(
            "Welcome, " + shortName(currentUser.name) + ".",
          );
          $("#ovBookings").text(one(mine.length, "booking", "bookings"));
          $("#ovStation").text(custStation);
          $("#ovStationSub").text(STN[custStation]);
          $("#ovPays").text(
            paid.length
              ? peso(paid.reduce((t, b) => t + b.total, 0))
              : "No payments yet",
          );
          $("#ovNotifs").text(n + " new");
          $("#stTiles").html(
            Object.keys(STN)
              .map(
                (k) =>
                  `<button class="st-tile ${custStation === k ? "active" : ""}" onclick="setStation('${k}')"><div class="fw-bold">${k}</div><small>${STN[k]}</small></button>`,
              )
              .join(""),
          );
          const pill = (k, c) =>
            `<button class="btn btn-sm ${custFilter === k ? "btn-pink" : "btn-outline-secondary"}" onclick="setCbFilter('${k}')">${k === "All" ? "All bookings" : k} &middot; ${c}</button>`;
          $("#cbPills").html(
            pill("All", mine.length) +
              pill("Pending", cnt("Pending")) +
              pill("Accepted", cnt("Accepted")) +
              pill("Rejected", cnt("Rejected")),
          );
          const list = mine.filter(
            (b) => custFilter === "All" || b.status === custFilter,
          );
          $("#cbList").html(
            list.length
              ? list
                  .map(
                    (b) =>
                      `<div class="d-flex justify-content-between align-items-center border rounded-3 p-3"><div><strong>${esc(b.service)}</strong>${b.addons.length ? `<div class="small text-muted">Add-ons: ${esc(b.addons.join(", "))}</div>` : ""}<small class="text-muted">${esc(b.station)} &middot; ${b.time}</small></div><span class="badge ${statusBadgeClass(b.status)} rounded-pill px-3 py-2">${b.status}</span></div>`,
                  )
                  .join("")
              : '<div class="text-center py-4"><i class="fa-regular fa-calendar text-pink fs-3 mb-2 d-block"></i><div class="fw-bold font-heading fs-5">Your first treatment is waiting.</div><p class="small text-muted mb-3">You have no bookings yet. Click “Avail Service” on a treatment to start.</p><button class="btn btn-pink btn-sm" onclick="showPane(\'services\')">Discover signature services</button></div>',
          );
          $("#cbPays").html(
            mine
              .filter((b) => b.status === "Accepted")
              .map((b) =>
                b.paid
                  ? `<div class="small py-2 border-bottom"><i class="fa-solid fa-circle-check text-success me-1"></i><strong>Paid ${peso(b.total)}</strong> &middot; ${esc(b.service)} &middot; Receipt ${b.receipt}</div>`
                  : `<div class="small py-2 border-bottom text-muted">${esc(b.service)} &middot; Please pay at the counter</div>`,
              )
              .join("") ||
              '<div class="small text-muted">No payments yet. Receipts appear after payment.</div>',
          );
          const notes = mine
            .filter((b) => b.status !== "Pending")
            .map(
              (b) =>
                `Your ${esc(b.service)} request was <strong>${b.status.toLowerCase()}</strong>.`,
            )
            .concat(paid.map((b) => `Payment of ${peso(b.total)} confirmed.`));
          $("#cbNotifs").html(
            notes.length
              ? notes.map((t) => `<div class="py-1">${t}</div>`).join("")
              : "You’re all caught up. Booking decisions and payment confirmations will appear here.",
          );
        }

        function renderCust() {
          renderCustBase();
          if (!currentUser || currentUser.role !== "Guest") return;
          $("#ovNotifList").html($("#cbNotifs").html());
          $("#stPays").html($("#cbPays").html());
          $("#ovOfferTitle").text($("#promoTitle").text());
        }

        window.addAccount = function () {
          const name = prompt("Full name?");
          if (!name) return;
          const user = prompt("Username / Name?");
          if (!user) return;
          const pass = prompt("Password?");
          if (!pass) return;
          const role =
            (
              prompt("Role: Staff or Customer?", "Staff") || ""
            ).toLowerCase() === "customer"
              ? "Guest"
              : "Staff";
          const account = {
            username: user.trim(),
            password: pass,
            role: role,
            name: name.trim(),
          };
          try {
            window.DJSALON_AUTH.saveUser(account);
            registeredUsers.push(account);
          } catch (error) {
            alert(
              error && error.message
                ? error.message
                : "Could not save the account in this browser.",
            );
            return;
          }
          renderWs();
        };

        function consoleKpi() {
          const pend = bookings.filter((b) => b.status === "Pending").length;
          const avg = reviewsData.length
            ? (
                reviewsData.reduce((t, r) => t + r.rating, 0) /
                reviewsData.length
              ).toFixed(1) + " ★"
            : "—";
          const c = (l, v, ic) =>
            `<div class="col-6 col-lg-3"><div class="kpi h-100"><div class="d-flex justify-content-between"><small class="text-muted fw-semibold text-uppercase">${l}</small><i class="fa-solid ${ic} text-pink"></i></div><div class="fs-3 fw-bold mt-1">${v}</div></div></div>`;
          return `<div class="row g-3 mb-3">${c("Pending bookings", pend, "fa-calendar-check")}${c("Pending IoT requests", activeIoTRequests.length, "fa-bell-concierge")}${c("Avg. rating", avg, "fa-star")}${c("Active stations", 3, "fa-microchip")}</div>`;
        }

        function panePayments() {
          const acc = bookings.filter((b) => b.status === "Accepted"),
            paid = acc.filter((b) => b.paid);
          const rows = acc.map((b) => [
            esc(b.station),
            b.paid
              ? '<span class="badge bg-success">Paid</span>'
              : '<span class="badge bg-danger">Unpaid</span>',
            esc(b.service) +
              (b.addons.length ? " + " + esc(b.addons.join(", ")) : ""),
            Number(b.paid ? b.total : bookingTotal(b)).toLocaleString("en-PH"),
            b.paid
              ? "—"
              : `<button class="btn btn-sm btn-pink" onclick="markPaid(${b.id})">Mark as paid</button>`,
          ]);
          const c = (l, v) =>
            `<div class="col-4"><div class="kpi text-center"><small class="text-muted fw-semibold text-uppercase">${l}</small><div class="fs-4 fw-bold">${v}</div></div></div>`;
          return `<div class="row g-3 mb-3">${c("Collected", peso(paid.reduce((t, b) => t + b.total, 0)))}${c("Paid bookings", paid.length)}${c("Awaiting payment", acc.length - paid.length)}</div><div class="ws-card"><h6 class="fw-bold mb-3">Bills &amp; payments</h6>${tbl(["Station", "Status", "Items", "Amount (₱)", "Action"], rows, "No accepted bookings to bill yet.")}</div>`;
        }

        window.markPaid = function (id) {
          const b = bookings.find((x) => x.id === id);
          if (!b || b.paid || !isStaffUser()) return;
          const t = bookingTotal(b);
          Object.assign(b, {
            paid: true,
            total: t,
            method: "Cash",
            received: t,
            change: 0,
            paidAt: new Date().toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            }),
            receipt: "R-" + String(b.id).slice(-6),
            paidDate: today(),
            handledBy: b.handledBy || shortName(currentUser.name),
            paySeen: false,
            payToasted: false,
          });
          saveBookings();
          renderBookingQueue();
          updateDashboardQueue();
        };

        function paneAnalytics() {
          const st = svcStats(),
            mx = Math.max(1, ...st.map((s) => s.cnt));
          return `<div class="row g-3"><div class="col-lg-5"><div class="ws-card h-100"><h6 class="fw-bold mb-3">Frequently requested services</h6>${st.map((s) => `<div class="d-flex justify-content-between small mb-1"><span>${esc(s.title)}</span><strong>${s.cnt}</strong></div><div class="progress mb-3" style="height:8px"><div class="progress-bar bg-pink" style="width:${(s.cnt / mx) * 100}%"></div></div>`).join("")}</div></div><div class="col-lg-7"><div class="ws-card h-100"><h6 class="fw-bold mb-3">Guest feedback</h6>${feedbackHtml()}</div></div></div>`;
        }

        // ---- Task-oriented notifications ----
        function taskLines() {
          const pend = bookings.filter((b) => b.status === "Pending");
          const sig = (t) =>
            activeIoTRequests.filter((r) => r.type === t).length;
          const nB = pend.filter((b) => !b.addons.length).length,
            nA = pend.filter((b) => b.addons.length).length;
          const nP = bookings.filter(
            (b) => b.status === "Accepted" && !b.paid,
          ).length;
          const nC = sig("Call Staff"),
            nBill = sig("Request Bill"),
            nO = sig("Order Add-on");
          return [
            [
              nB,
              plural(nB, "pending booking", "pending bookings"),
              "fa-calendar-check",
              "warning",
            ],
            [
              nA,
              plural(nA, "add-on request", "add-on requests"),
              "fa-circle-plus",
              "warning",
            ],
            [
              nP,
              plural(
                nP,
                "accepted booking awaiting payment",
                "accepted bookings awaiting payment",
              ),
              "fa-credit-card",
              "danger",
            ],
            [
              nC,
              plural(
                nC,
                "station calling for staff",
                "stations calling for staff",
              ),
              "fa-bell-concierge",
              "danger",
            ],
            [
              nBill,
              plural(nBill, "bill request", "bill requests"),
              "fa-receipt",
              "danger",
            ],
            [
              nO,
              plural(
                nO,
                "add-on order from a station",
                "add-on orders from stations",
              ),
              "fa-mug-hot",
              "warning",
            ],
          ].filter((l) => l[0] > 0);
        }

        function updateTaskBadge() {
          const n = taskLines().reduce((t, l) => t + l[0], 0);
          $("#navTaskBadge, #tbBadge")
            .text(n)
            .toggleClass("d-none", n === 0);
        }

        // ---- Navigation ----
        function buildRoleNav() {
          const tabs = WS_TABS[currentUser.role];
          $("#roleNavBtns").html(
            tabs
              .map(
                ([k, label, ic]) => `
                    <button class="btn btn-sm ${wsTab === k ? "btn-pink" : "btn-outline-light"}" onclick="openWs('${k}')">
                        <i class="fa-solid ${ic} me-1"></i>${label}${k === "notifs" ? '<span id="navTaskBadge" class="badge rounded-pill bg-danger ms-1 d-none"></span>' : ""}
                    </button>`,
              )
              .join(""),
          );
          updateTaskBadge();
          buildSide();
        }

        window.openWs = function (tab) {
          wsTab = tab;
          buildRoleNav();
          renderWs();
        };

        function refreshWs() {
          if (!isStaffUser() || !wsTab) return;
          updateTaskBadge();
          if (["notifs", "reports", "payments", "analytics"].includes(wsTab))
            renderWs(); // live panes; edit panes are left alone so typing isn't interrupted
        }

        function renderWs() {
          if (!isStaffUser() || !wsTab) return;
          const owner = isOwner();
          const T = {
            notifs: [
              "Console",
              "Incoming requests and bookings, in real time.",
            ],
            payments: ["Payments", "Review and settle station bills."],
            services: [
              owner ? "Service Management" : "Manage Services",
              "Keep treatments, prices and descriptions up to date.",
            ],
            schedules: [
              "Staff Schedules",
              "Who is working, when, and at which station.",
            ],
            analytics: [
              "Analytics & Feedback",
              "Popular services and guest ratings.",
            ],
            staff: ["Staff", "Schedules and registered accounts."],
            reports: ["Reports", "Revenue, service mix and staff performance."],
            settings: ["Settings", "Offer banner, demo data and accounts."],
          }[wsTab];
          const panes = {
            payments: panePayments,
            analytics: paneAnalytics,
            services: paneServices,
            schedules: () => paneSchedules(false),
            notifs: paneNotifs,
            staff: paneStaff,
            reports: paneReports,
            settings: paneSettings,
          };
          charts.forEach((c) => c.destroy());
          charts = [];
          $("#wsBody").html(`
                    <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
                        <div><h4 class="m-0 font-heading">${T[0]}</h4><small class="text-muted">${T[1]}</small></div>
                        <span class="text-muted small">${new Date().toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}</span>
                    </div>
                    ${owner ? kpiStrip() : ""}
                    ${panes[wsTab]()}`);
          if (wsTab === "reports") drawCharts();
        }

        // ---- SERVICES: table, inline edit, bulk actions ----
        function paneServices() {
          const rows = servicesData
            .map((s) => {
              const off = s.active === false;
              return `<tr class="${off ? "text-muted" : ""}">
                        <td><input type="checkbox" class="form-check-input svc-sel" value="${s.id}"></td>
                        <td class="fw-semibold">${esc(s.title)}</td>
                        <td style="width:130px"><input type="number" min="0" step="1" class="form-control form-control-sm inline-in" value="${s.price}" onchange="editSvc(${s.id}, 'price', this)"></td>
                        <td><input class="form-control form-control-sm inline-in" value="${esc(s.desc)}" onchange="editSvc(${s.id}, 'desc', this)"></td>
                        <td><button class="btn btn-sm ${off ? "btn-outline-secondary" : "btn-success"} py-0" style="min-width:78px" onclick="bulkSvc([${s.id}], ${off})">${off ? "Inactive" : "Active"}</button></td>
                        <td class="text-end"><button class="btn btn-sm btn-outline-danger border-0" title="Delete" onclick="deleteService(${s.id})"><i class="fa-solid fa-trash"></i></button></td>
                    </tr>`;
            })
            .join("");
          const active = servicesData.filter((s) => s.active !== false).length;
          return `<div class="ws-card">
                    <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
                        <div class="text-muted small"><strong>${active}</strong> active &middot; ${servicesData.length - active} inactive &middot; edit price or description directly in the table</div>
                        <div class="d-flex gap-2">
                            <button class="btn btn-sm btn-success" onclick="bulkSel(true)"><i class="fa-solid fa-toggle-on me-1"></i>Activate selected</button>
                            <button class="btn btn-sm btn-outline-secondary" onclick="bulkSel(false)"><i class="fa-solid fa-toggle-off me-1"></i>Deactivate selected</button>
                        </div>
                    </div>
                    <div class="table-responsive"><table class="table table-sm table-hover align-middle mb-3 tbl-compact">
                        <thead class="table-light"><tr><th style="width:36px"><input type="checkbox" class="form-check-input" onchange="$('.svc-sel').prop('checked', this.checked)"></th><th>Service</th><th>Price (₱)</th><th>Description</th><th>Status</th><th></th></tr></thead>
                        <tbody>${rows || '<tr><td colspan="6" class="text-center text-muted py-3">No services yet.</td></tr>'}</tbody>
                    </table></div>
                    <form class="row g-2 align-items-center border-top pt-3" onsubmit="addService(event)">
                        <div class="col-md-3"><input class="form-control form-control-sm" id="nsTitle" placeholder="New service name" required></div>
                        <div class="col-md-2"><input type="number" min="0" class="form-control form-control-sm" id="nsPrice" placeholder="Price (₱)" required></div>
                        <div class="col-md-4"><input class="form-control form-control-sm" id="nsDesc" placeholder="Description" required></div>
                        <div class="col-md-2"><input class="form-control form-control-sm" id="nsImg" placeholder="Image URL (optional)"></div>
                        <div class="col-md-1 d-grid"><button class="btn btn-sm btn-pink" type="submit">Add</button></div>
                    </form>
                </div>`;
        }

        window.editSvc = function (id, field, el) {
          const s = servicesData.find((x) => x.id === id);
          if (!s) return;
          const v = el.value.trim();
          if (
            (field === "price" &&
              (v === "" || isNaN(parseFloat(v)) || parseFloat(v) < 0)) ||
            (field === "desc" && !v)
          ) {
            showToast(
              "Not saved",
              field === "price"
                ? "Price must be a number, 0 or higher."
                : "Description cannot be empty.",
              false,
            );
            renderWs();
            return;
          }
          if (field === "price") s.price = parseFloat(v);
          else s.desc = v;
          renderServices();
          el.classList.add("is-valid");
          setTimeout(() => el.classList.remove("is-valid"), 1200);
        };

        window.bulkSvc = function (ids, activate) {
          servicesData.forEach((s) => {
            if (ids.includes(s.id)) s.active = activate;
          });
          renderServices();
          renderWs();
        };

        window.bulkSel = function (activate) {
          const ids = $(".svc-sel:checked")
            .map(function () {
              return parseInt(this.value);
            })
            .get();
          if (!ids.length) {
            showToast(
              "Nothing selected",
              "Tick one or more services first.",
              false,
            );
            return;
          }
          bulkSvc(ids, activate);
        };

        window.addService = function (e) {
          e.preventDefault();
          servicesData.push({
            id: Date.now(),
            active: true,
            title: $("#nsTitle").val().trim(),
            price: parseFloat($("#nsPrice").val()),
            desc: $("#nsDesc").val().trim(),
            img: $("#nsImg").val().trim(),
          });
          renderServices();
          renderWs();
        };

        window.deleteService = function (id) {
          const s = servicesData.find((x) => x.id === id);
          if (
            !s ||
            !confirm(
              `Delete "${s.title}"? Deactivate it instead if you may need it again.`,
            )
          )
            return;
          servicesData = servicesData.filter((x) => x.id !== id);
          renderServices();
          renderWs();
        };

        // ---- NOTIFICATIONS (staff) ----
        function paneNotifs() {
          const lines = taskLines();
          const chips = lines.length
            ? lines
                .map(
                  (l) =>
                    `<span class="task-chip bg-${l[3]}-subtle text-${l[3]}-emphasis border border-${l[3]}-subtle"><i class="fa-solid ${l[2]} me-1"></i>${l[1]}</span>`,
                )
                .join("")
            : '<span class="task-chip bg-success-subtle text-success-emphasis"><i class="fa-solid fa-circle-check me-1"></i>All clear: nothing needs attention</span>';
          const rows = [];
          bookings
            .filter((b) => b.status === "Pending")
            .forEach((b) =>
              rows.push([
                `<span class="badge ${b.addons.length ? "bg-info text-dark" : "bg-warning text-dark"}">${b.addons.length ? "Add-on request" : "Booking"}</span>`,
                `${esc(b.station)} &middot; ${esc(shortName(b.customer))}`,
                esc(b.service) +
                  (b.addons.length ? " + " + esc(b.addons.join(", ")) : ""),
                b.time,
                `<button class="btn btn-sm btn-success" onclick="decideBooking(${b.id}, 'Accepted')">Accept</button> <button class="btn btn-sm btn-outline-danger" onclick="decideBooking(${b.id}, 'Rejected')">Reject</button>`,
              ]),
            );
          bookings
            .filter((b) => b.status === "Accepted" && !b.paid)
            .forEach((b) =>
              rows.push([
                '<span class="badge bg-danger">Payment due</span>',
                `${esc(b.station)} &middot; ${esc(shortName(b.customer))}`,
                esc(b.service) +
                  (b.addons.length ? " + " + esc(b.addons.join(", ")) : ""),
                b.time,
                `<button class="btn btn-sm btn-pink" onclick="openStaffHub()">Collect ${peso(bookingTotal(b))}</button>`,
              ]),
            );
          activeIoTRequests.forEach((r) =>
            rows.push([
              '<span class="badge bg-dark">Station signal</span>',
              esc(r.station),
              esc(r.type),
              r.time,
              `<button class="btn btn-sm btn-outline-secondary" onclick="acknowledgeRequest(${r.id})">Acknowledge</button>`,
            ]),
          );
          return `${consoleKpi()}<div class="ws-card">
                    <div class="d-flex flex-wrap gap-2 mb-3">${chips}</div>
                    ${tbl(["Type", "Station / customer", "Request", "Time", "Action"], rows, "Nothing to action right now.")}
                    <div class="text-end mt-3"><button class="btn btn-sm btn-outline-dark" onclick="openStaffHub()"><i class="fa-solid fa-list-check me-1"></i>Open full queue &amp; payments</button></div>
                </div>`;
        }

        // ---- SCHEDULES ----
        function getSched(u) {
          let s = schedules.find((x) => x.user === u.username);
          if (!s) {
            s = {
              user: u.username,
              days: ["Mon", "Tue", "Wed", "Thu", "Fri"],
              start: "09:00",
              end: "18:00",
              station: "Station 01",
            };
            schedules.push(s);
          }
          return s;
        }

        function paneSchedules(editable) {
          const rows = registeredUsers
            .filter((u) => u.role === "Staff")
            .map((u) => {
              const i = registeredUsers.indexOf(u),
                s = getSched(u);
              const me = currentUser && currentUser.username === u.username;
              const days = DAYS.map(
                (d) =>
                  `<button class="btn btn-sm py-0 px-2 ${s.days.includes(d) ? "btn-pink" : "btn-outline-secondary"}" ${editable ? `onclick="toggleDay(${i}, '${d}')"` : "disabled"}>${d}</button>`,
              ).join(" ");
              const time = editable
                ? `<input type="time" class="form-control form-control-sm inline-in d-inline-block" style="width:110px" value="${s.start}" onchange="setSched(${i}, 'start', this.value)"> &ndash; <input type="time" class="form-control form-control-sm inline-in d-inline-block" style="width:110px" value="${s.end}" onchange="setSched(${i}, 'end', this.value)">`
                : `${s.start} &ndash; ${s.end}`;
              const stn = editable
                ? `<input class="form-control form-control-sm inline-in" style="width:120px" value="${esc(s.station)}" onchange="setSched(${i}, 'station', this.value)">`
                : esc(s.station);
              return [
                `<strong>${esc(shortName(u.name))}</strong>${me ? ' <span class="badge bg-pink">You</span>' : ""}`,
                `<div class="d-flex flex-wrap gap-1">${days}</div>`,
                time,
                stn,
              ];
            });
          return `<div class="ws-card"><h6 class="fw-bold mb-3">Staff Schedules ${editable ? '<small class="text-muted fw-normal">(click days, times or station to edit)</small>' : ""}</h6>${tbl(["Staff", "Days", "Shift", "Station"], rows, "No staff accounts registered yet.")}</div>`;
        }

        window.setRep = function (k) {
          repTab = k;
          renderWs();
        };

        window.toggleDay = function (i, d) {
          const s = getSched(registeredUsers[i]);
          s.days = s.days.includes(d)
            ? s.days.filter((x) => x !== d)
            : DAYS.filter((x) => x === d || s.days.includes(x));
          renderWs();
        };
        window.setSched = function (i, f, v) {
          if (v) getSched(registeredUsers[i])[f] = v;
        };

        // ---- OWNER: staff tab ----
        function paneStaff() {
          const accounts = registeredUsers
            .map(
              (u) =>
                `<div class="d-flex justify-content-between align-items-center py-2 border-bottom"><span><strong>${esc(shortName(u.name))}</strong> <small class="text-muted">@${esc(u.username)}</small></span><span class="badge ${u.role === "Owner" ? "bg-danger" : "bg-pink"}">${u.role === "Guest" ? "Customer" : u.role}</span></div>`,
            )
            .join("");
          return `${paneSchedules(true)}<div class="ws-card mt-3"><div class="d-flex justify-content-between align-items-center mb-2"><h6 class="fw-bold m-0">Registered Accounts</h6><button class="btn btn-sm btn-pink" onclick="addAccount()">Add account</button></div>${accounts}</div>`;
        }

        // ---- OWNER: analytics ----
        function staffStats() {
          return registeredUsers
            .filter((u) => u.role === "Staff")
            .map((u) => {
              const n = shortName(u.name),
                h = bookings.filter((b) => b.handledBy === n),
                acc = h.filter((b) => b.status === "Accepted");
              return {
                name: n,
                handled: h.length,
                accepted: acc.length,
                rejected: h.length - acc.length,
                revenue: h
                  .filter((b) => b.paid)
                  .reduce((t, b) => t + b.total, 0),
              };
            })
            .sort((a, b) => b.handled - a.handled);
        }

        function svcStats() {
          const paid = bookings.filter((b) => b.paid);
          return servicesData
            .map((s) => ({
              title: s.title,
              cnt: bookings.filter(
                (b) =>
                  b.status !== "Rejected" &&
                  bookingItems(b).some((i) => i.title === s.title),
              ).length,
              rev: paid.reduce(
                (t, b) =>
                  t +
                  bookingItems(b)
                    .filter((i) => i.title === s.title)
                    .reduce((x, i) => x + i.price, 0),
                0,
              ),
            }))
            .sort((a, b) => b.rev - a.rev || b.cnt - a.cnt);
        }

        function kpiStrip() {
          const td = today(),
            paid = bookings.filter((b) => b.paid);
          const top = [...svcStats()].sort((a, b) => b.cnt - a.cnt)[0];
          const avg = reviewsData.length
            ? (
                reviewsData.reduce((t, r) => t + r.rating, 0) /
                reviewsData.length
              ).toFixed(1) + "★"
            : "—";
          const card = (label, val, sub, ic) =>
            `<div class="col-6 col-lg-3"><div class="kpi h-100"><div class="d-flex justify-content-between"><small class="text-muted fw-semibold text-uppercase">${label}</small><i class="fa-solid ${ic} text-pink"></i></div><div class="fs-3 fw-bold lh-sm mt-1">${val}</div><small class="text-muted">${sub}</small></div></div>`;
          return `<div class="row g-3 mb-4">
                    ${card("Bookings today", bookings.filter((b) => (b.date || td) === td).length, plural(bookings.filter((b) => b.status === "Pending").length, "pending", "pending"), "fa-calendar-check")}
                    ${card("Revenue today", peso(paid.filter((b) => (b.paidDate || td) === td).reduce((t, b) => t + b.total, 0)), peso(paid.reduce((t, b) => t + b.total, 0)) + " collected overall", "fa-coins")}
                    ${card("Most popular", top && top.cnt ? esc(top.title) : "—", top && top.cnt ? plural(top.cnt, "booking", "bookings") : "No bookings yet", "fa-star")}
                    ${card("Customer rating", avg, plural(reviewsData.length, "review", "reviews"), "fa-face-smile")}
                </div>`;
        }

        function feedbackHtml() {
          const n = reviewsData.length;
          if (!n)
            return '<div class="text-muted small py-3 text-center">No reviews yet.</div>';
          const avg = (
            reviewsData.reduce((t, r) => t + r.rating, 0) / n
          ).toFixed(1);
          const dist = [5, 4, 3, 2, 1]
            .map((r) => {
              const c = reviewsData.filter((x) => x.rating === r).length;
              return `<div class="d-flex align-items-center gap-2 small"><span style="width:26px">${r}★</span><div class="progress flex-fill" style="height:8px"><div class="progress-bar bg-pink" style="width:${(c / n) * 100}%"></div></div><span class="text-muted" style="width:22px">${c}</span></div>`;
            })
            .join("");
          const recent = reviewsData
            .slice(0, 4)
            .map(
              (r) =>
                `<div class="border-bottom py-2 small"><strong>${esc(r.name)}</strong> <span class="text-muted">&middot; ${esc(r.station)} &middot; ${r.rating}★</span><div class="text-muted">${esc(r.comment)}</div></div>`,
            )
            .join("");
          return `<div class="row g-4"><div class="col-md-4"><div class="fs-2 fw-bold">${avg}<small class="fs-6 text-muted"> / 5 &middot; ${plural(n, "review", "reviews")}</small></div>${dist}</div><div class="col-md-8">${recent}</div></div>`;
        }

        function paneReports() {
          const hasSvc = svcStats().some((s) => s.cnt > 0),
            hasRev = bookings.some((b) => b.paid);
          const total = svcStats().reduce((x, s) => x + s.rev, 0);
          const body = {
            staffperf: () =>
              tbl(
                ["Staff", "Handled", "Accepted", "Rejected", "Revenue handled"],
                staffStats().map((s) => [
                  `<strong>${esc(s.name)}</strong>`,
                  s.handled,
                  s.accepted,
                  s.rejected,
                  peso(s.revenue),
                ]),
                "No staff accounts yet.",
              ),
            profit: () =>
              tbl(
                ["Service", "Bookings", "Revenue", "Share of revenue"],
                svcStats().map((s) => [
                  `<strong>${esc(s.title)}</strong>`,
                  s.cnt,
                  peso(s.rev),
                  total ? Math.round((s.rev / total) * 100) + "%" : "0%",
                ]),
                "No services yet.",
              ),
            feedback: feedbackHtml,
          }[repTab]();
          const pill = (k, l) =>
            `<button class="btn btn-sm ${repTab === k ? "btn-pink" : "btn-outline-secondary"}" onclick="setRep('${k}')">${l}</button>`;
          return `<div class="row g-3 mb-3">
                        <div class="col-lg-7"><div class="ws-card h-100"><h6 class="fw-bold">Revenue trend <small class="text-muted fw-normal">last 7 days</small></h6>${hasRev ? '<canvas id="revChart" height="150"></canvas>' : '<div class="text-muted small py-5 text-center">No payments recorded yet.</div>'}</div></div>
                        <div class="col-lg-5"><div class="ws-card h-100"><h6 class="fw-bold">Service distribution</h6>${hasSvc ? '<canvas id="svcChart" height="190"></canvas>' : '<div class="text-muted small py-5 text-center">No bookings yet.</div>'}</div></div>
                    </div>
                    <div class="ws-card"><div class="d-flex gap-2 mb-3 flex-wrap">${pill("staffperf", "Staff performance")}${pill("profit", "Service profitability")}${pill("feedback", "Customer feedback")}</div>${body}</div>`;
        }

        function drawCharts() {
          if (typeof Chart === "undefined") return;
          const rc = document.getElementById("revChart"),
            sc = document.getElementById("svcChart"),
            td = today();
          if (rc) {
            const days = [];
            for (let i = 6; i >= 0; i--) {
              const d = new Date();
              d.setDate(d.getDate() - i);
              days.push(d.toLocaleDateString("en-CA"));
            }
            const data = days.map((d) =>
              bookings
                .filter((b) => b.paid && (b.paidDate || td) === d)
                .reduce((t, b) => t + b.total, 0),
            );
            charts.push(
              new Chart(rc, {
                type: "line",
                data: {
                  labels: days.map((d) => d.slice(5)),
                  datasets: [
                    {
                      label: "Revenue (₱)",
                      data,
                      borderColor: "#E88299",
                      backgroundColor: "rgba(232,130,153,.15)",
                      fill: true,
                      tension: 0.35,
                    },
                  ],
                },
                options: {
                  plugins: { legend: { display: false } },
                  scales: { y: { beginAtZero: true } },
                },
              }),
            );
          }
          if (sc) {
            const st = svcStats().filter((s) => s.cnt > 0);
            charts.push(
              new Chart(sc, {
                type: "pie",
                data: {
                  labels: st.map((s) => s.title),
                  datasets: [
                    {
                      data: st.map((s) => s.cnt),
                      backgroundColor: [
                        "#E88299",
                        "#D4607B",
                        "#9333EA",
                        "#F4B6C4",
                        "#B84360",
                        "#6D28D9",
                      ],
                    },
                  ],
                },
                options: { plugins: { legend: { position: "bottom" } } },
              }),
            );
          }
        }

        // ---- OWNER: settings ----
        function paneSettings() {
          const hasSample = bookings.some((b) => b.sample);
          return `<div class="row g-3">
                    <div class="col-lg-7"><form class="ws-card" onsubmit="savePromo(event)">
                        <h6 class="fw-bold mb-3">Customer Offer Banner</h6>
                        <input class="form-control mb-2" id="setPromoTitle" value="${esc($("#promoTitle").text())}" required>
                        <textarea class="form-control mb-3" id="setPromoDesc" rows="2" required>${esc($("#promoDesc").text())}</textarea>
                        <button class="btn btn-pink btn-sm" type="submit">Update offer</button>
                    </form></div>
                    <div class="col-lg-5"><div class="ws-card h-100">
                        <h6 class="fw-bold mb-2">Demo Data</h6>
                        <p class="small text-muted">Fills Reports with a week of sample paid bookings so you can preview the charts. Sample rows are tagged and can be removed anytime.</p>
                        <button class="btn btn-sm ${hasSample ? "btn-outline-danger" : "btn-outline-dark"}" onclick="toggleSample()">${hasSample ? "Remove sample data" : "Load sample data"}</button>
                    </div></div>
                </div>`;
        }

        window.savePromo = function (e) {
          e.preventDefault();
          $("#promoTitle").text($("#setPromoTitle").val());
          $("#promoDesc").text($("#setPromoDesc").val());
          showToast(
            "Offer updated",
            "The customer banner now shows your changes.",
            true,
          );
        };

        window.toggleSample = function () {
          if (bookings.some((b) => b.sample)) {
            bookings = bookings.filter((b) => !b.sample);
          } else {
            const svc = servicesData.filter((s) => s.active !== false),
              staff = registeredUsers
                .filter((u) => u.role === "Staff")
                .map((u) => shortName(u.name));
            if (!svc.length) return;
            for (let i = 0; i < 18; i++) {
              const d = new Date();
              d.setDate(d.getDate() - (i % 7));
              const ds = d.toLocaleDateString("en-CA"),
                main = svc[(i * 2) % svc.length],
                extra =
                  i % 3 === 0
                    ? [svc[(i + 1) % svc.length]].filter(
                        (x) => x.id !== main.id,
                      )
                    : [];
              const b = {
                id: 9000000 + i,
                sample: true,
                customer: "Sample Customer",
                service: main.title,
                addons: extra.map((x) => x.title),
                station: "Station 0" + (1 + (i % 3)),
                date: ds,
                status: "Accepted",
                time: "1:00 PM",
                handledBy: staff.length ? staff[i % staff.length] : "Staff",
                seen: true,
                paySeen: true,
                toasted: true,
                payToasted: true,
                paid: true,
                method: ["Cash", "GCash", "Card"][i % 3],
                paidDate: ds,
                receipt: "R-S" + i,
              };
              b.total = bookingTotal(b);
              b.received = b.total;
              b.change = 0;
              bookings.push(b);
            }
          }
          saveBookings();
          renderBookingQueue();
          updateDashboardQueue();
          renderWs();
        };

        // --- CUSTOMER BOOKINGS: AVAIL + ADD-ONS ---
        function pendingTotal() {
          return (
            activeIoTRequests.length +
            bookings.filter((b) => b.status === "Pending").length
          );
        }

        function requireLogin() {
          if (isStaffUser()) {
            showToast(
              "Customer action",
              "Staff and owner accounts can't place bookings.",
              false,
            );
            return false;
          }
          if (currentUser) return true;
          alert("Please log in to your account first.");
          window.location.assign("login.html");
          return false;
        }

        function addBooking(service, addons) {
          bookings.unshift({
            id: Date.now(),
            customer: currentUser.name,
            service: service,
            addons: addons,
            station: custStation,
            date: today(),
            status: "Pending",
            time: new Date().toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            }),
          });
          totalSignalsCount++;
          updateDashboardQueue();
          renderBookingQueue();
          document
            .getElementById("alertChime")
            .play()
            .catch(() => {});
          saveBookings();
          alert(
            'Request sent! Status: PENDING. Staff will accept or reject it. Check "My Bookings" to see the update.',
          );
        }

        window.availService = function (id) {
          if (!requireLogin()) return;
          const s = servicesData.find((x) => x.id === id);
          if (s) addBooking(s.title, []);
        };

        let addonBaseId = null;
        window.openAddonPicker = function (id) {
          if (!requireLogin()) return;
          const base = servicesData.find((x) => x.id === id);
          if (!base) return;
          addonBaseId = id;
          $("#addonFor").text(
            "Add-ons for: " + base.title + ". Pick one or more services.",
          );
          const opts = $("#addonOptions");
          opts.empty();
          servicesData
            .filter((x) => x.id !== id)
            .forEach((s) => {
              opts.append(`
                        <label class="d-flex justify-content-between align-items-center p-3 border rounded-3" style="cursor:pointer;">
                            <span><input type="checkbox" class="form-check-input me-2 addon-check" value="${s.id}">${s.title}</span>
                            <strong class="text-pink">${peso(s.price)}</strong>
                        </label>
                    `);
            });
          new bootstrap.Modal(document.getElementById("addonModal")).show();
        };

        window.confirmAddon = function () {
          const ids = $(".addon-check:checked")
            .map(function () {
              return parseInt(this.value);
            })
            .get();
          if (ids.length === 0) {
            alert("Please choose at least one add-on.");
            return;
          }
          const base = servicesData.find((x) => x.id === addonBaseId);
          const names = ids
            .map((i) => servicesData.find((x) => x.id === i))
            .filter(Boolean)
            .map((s) => s.title);
          bootstrap.Modal.getInstance(
            document.getElementById("addonModal"),
          ).hide();
          addBooking(base.title, names);
        };

        // --- STAFF: ACCEPT / REJECT ---
        function statusBadgeClass(status) {
          return status === "Pending"
            ? "bg-warning text-dark"
            : status === "Accepted"
              ? "bg-success"
              : "bg-danger";
        }

        function renderBookingQueue() {
          updatePaymentSummary();
          const box = $("#bookingQueue");
          box.empty();
          if (bookings.length === 0) {
            box.html(
              '<div class="text-center py-4 bg-white rounded-4 shadow-sm text-muted">No service requests yet.</div>',
            );
            return;
          }
          bookings.forEach((b) => {
            const addonText = b.addons.length
              ? `<div class="small text-muted">Add-ons: ${b.addons.join(", ")}</div>`
              : "";
            const actions =
              b.status === "Pending"
                ? `
                        <div class="d-flex gap-2 mt-2">
                            <button class="btn btn-sm btn-success rounded-pill flex-fill fw-bold" onclick="decideBooking(${b.id}, 'Accepted')"><i class="fa-solid fa-check me-1"></i>Accept</button>
                            <button class="btn btn-sm btn-outline-danger rounded-pill flex-fill fw-bold" onclick="decideBooking(${b.id}, 'Rejected')"><i class="fa-solid fa-xmark me-1"></i>Reject</button>
                        </div>`
                : "";
            box.append(`
                        <div class="card request-card order-addon p-3">
                            <div class="d-flex justify-content-between align-items-center mb-1">
                                <span class="badge bg-dark rounded-pill">${b.station} &middot; ${b.customer}</span>
                                <span class="badge ${statusBadgeClass(b.status)} rounded-pill">${b.status}</span>
                            </div>
                            <h5 class="fw-bold my-1 font-heading">${b.service}</h5>
                            ${addonText}
                            <small class="text-muted"><i class="fa-regular fa-clock me-1"></i>${b.time}</small>
                            ${actions}${paymentHtml(b)}
                        </div>
                    `);
          });
        }

        window.decideBooking = function (id, status) {
          const b = bookings.find((x) => x.id === id);
          if (!b) return;
          b.status = status;
          b.handledBy = currentUser ? shortName(currentUser.name) : "";
          b.seen = false;
          b.toasted = false;
          saveBookings();
          renderBookingQueue();
          updateDashboardQueue();
        };

        // --- STAFF: PAYMENTS ---
        let payingId = null;

        function isStaffUser() {
          return (
            currentUser &&
            (currentUser.role === "Owner" || currentUser.role === "Staff")
          );
        }

        function priceOf(title) {
          const svc = servicesData.find((x) => x.title === title);
          return svc ? svc.price : 0;
        }

        function bookingItems(b) {
          return [b.service]
            .concat(b.addons)
            .map((t) => ({ title: t, price: priceOf(t) }));
        }

        function bookingTotal(b) {
          return bookingItems(b).reduce((sum, i) => sum + i.price, 0);
        }

        function updatePaymentSummary() {
          const collected = bookings
            .filter((b) => b.paid)
            .reduce((t, b) => t + b.total, 0);
          const paidCount = bookings.filter((b) => b.paid).length;
          const unpaid = bookings.filter(
            (b) => b.status === "Accepted" && !b.paid,
          ).length;
          $("#paymentSummary").html(`
                    <div class="col-4"><div class="p-3 bg-white rounded-4 shadow-sm text-center"><small class="text-muted d-block fw-semibold">Collected</small><h5 class="m-0 fw-bold text-success">${peso(collected)}</h5></div></div>
                    <div class="col-4"><div class="p-3 bg-white rounded-4 shadow-sm text-center"><small class="text-muted d-block fw-semibold">Paid Bookings</small><h5 class="m-0 fw-bold">${paidCount}</h5></div></div>
                    <div class="col-4"><div class="p-3 bg-white rounded-4 shadow-sm text-center"><small class="text-muted d-block fw-semibold">Awaiting Payment</small><h5 class="m-0 fw-bold text-danger">${unpaid}</h5></div></div>
                `);
        }

        function paymentHtml(b) {
          if (b.status !== "Accepted") return "";
          if (b.paid) {
            return `<div class="mt-2 p-2 rounded-3 small" style="background:#E6F6EC;">
                        <i class="fa-solid fa-circle-check text-success me-1"></i><strong>Paid ${peso(b.total)}</strong> via ${b.method}
                        &middot; Receipt ${b.receipt}${b.method === "Cash" ? " &middot; Change " + peso(b.change) : ""}
                    </div>`;
          }
          const total = bookingTotal(b);
          if (payingId !== b.id) {
            return `<button class="btn btn-sm btn-pink rounded-pill w-100 mt-2 fw-bold" onclick="openPayment(${b.id})"><i class="fa-solid fa-credit-card me-1"></i>Collect Payment &middot; ${peso(total)}</button>`;
          }
          const rows = bookingItems(b)
            .map(
              (i) =>
                `<div class="d-flex justify-content-between small"><span>${i.title}</span><span>${peso(i.price)}</span></div>`,
            )
            .join("");
          return `
                    <div class="mt-3 p-3 bg-light rounded-3 border">
                        <div class="fw-bold small text-uppercase text-muted mb-2">Payment</div>
                        ${rows}
                        <div class="d-flex justify-content-between fw-bold border-top pt-2 mt-2"><span>Total</span><span>${peso(total)}</span></div>
                        <select class="form-select form-select-sm mt-2" id="payMethod" onchange="onPayMethod(${total})">
                            <option value="Cash">Cash</option>
                            <option value="GCash">GCash</option>
                            <option value="Card">Card</option>
                        </select>
                        <div id="payReceivedWrap">
                            <input type="number" min="0" step="0.01" class="form-control form-control-sm mt-2" id="payReceived" placeholder="Amount received" oninput="updatePayChange(${total})">
                            <div class="small mt-1" id="payChange"></div>
                        </div>
                        <div class="d-flex gap-2 mt-3">
                            <button class="btn btn-sm btn-pink rounded-pill flex-fill fw-bold" onclick="confirmPayment(${b.id})">Confirm Payment</button>
                            <button class="btn btn-sm btn-outline-secondary rounded-pill flex-fill" onclick="cancelPayment()">Cancel</button>
                        </div>
                    </div>`;
        }

        window.openPayment = function (id) {
          if (!isStaffUser()) return;
          payingId = id;
          renderBookingQueue();
        };

        window.cancelPayment = function () {
          payingId = null;
          renderBookingQueue();
        };

        window.onPayMethod = function (total) {
          $("#payReceivedWrap").toggle($("#payMethod").val() === "Cash");
        };

        window.updatePayChange = function (total) {
          const received = parseFloat($("#payReceived").val());
          const out = $("#payChange");
          if (isNaN(received)) {
            out.text("");
            return;
          }
          const diff = received - total;
          out
            .toggleClass("text-danger", diff < 0)
            .toggleClass("text-success", diff >= 0)
            .text(
              diff < 0
                ? "Short by " + peso(Math.abs(diff))
                : "Change: " + peso(diff),
            );
        };

        window.confirmPayment = function (id) {
          if (!isStaffUser()) return;
          const b = bookings.find((x) => x.id === id);
          if (!b || b.paid) return;
          const total = bookingTotal(b);
          const method = $("#payMethod").val();
          let received = total;
          if (method === "Cash") {
            received = parseFloat($("#payReceived").val());
            if (isNaN(received) || received < total) {
              alert("Amount received must be at least " + peso(total));
              return;
            }
          }
          b.paid = true;
          b.total = total;
          b.method = method;
          b.received = received;
          b.change = received - total;
          b.paidAt = new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          });
          b.receipt = "R-" + String(b.id).slice(-6);
          b.paidDate = today();
          b.handledBy =
            b.handledBy || (currentUser ? shortName(currentUser.name) : "");
          b.paySeen = false;
          b.payToasted = false;
          payingId = null;
          saveBookings();
          renderBookingQueue();
        };

        // --- CUSTOMER: NOTIFICATIONS ---
        function unseenUpdates() {
          if (!currentUser) return [];
          return bookings.filter(
            (b) =>
              b.customer === currentUser.name &&
              ((b.status !== "Pending" && !b.seen) || (b.paid && !b.paySeen)),
          );
        }

        function updateNotifBadge() {
          const n = unseenUpdates().length;
          $("#notifBadge")
            .text(n)
            .toggleClass("d-none", n === 0);
          if (currentUser && currentUser.role === "Guest") {
            $("#tbBadge")
              .text(n)
              .toggleClass("d-none", n === 0);
            renderCust();
          }
        }

        function showToast(title, body, ok) {
          const el = $(`
                    <div class="toast align-items-center text-white border-0 ${ok ? "bg-success" : "bg-danger"}" role="alert">
                        <div class="d-flex">
                            <div class="toast-body"><strong>${title}</strong><br>${body}</div>
                            <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
                        </div>
                    </div>
                `);
          $("#toastBox").append(el);
          new bootstrap.Toast(el[0], { delay: 10000 }).show();
        }

        function checkNotifications() {
          if (isStaffUser()) {
            if (currentUser.role === "Staff") {
              const lines = taskLines();
              if (lines.length)
                showToast(
                  "Needs your attention",
                  lines.map((l) => l[1]).join("<br>"),
                  true,
                );
            }
            return;
          }
          unseenUpdates().forEach((b) => {
            const what =
              b.service + (b.addons.length ? " + " + b.addons.join(", ") : "");
            if (b.status !== "Pending" && !b.seen && !b.toasted) {
              b.toasted = true;
              const ok = b.status === "Accepted";
              showToast(
                ok ? "Booking Accepted" : "Booking Rejected",
                ok
                  ? `Good news! Staff accepted your request for ${what}.`
                  : `Sorry, staff could not accept your request for ${what}. Please choose another service or call staff.`,
                ok,
              );
            }
            if (b.paid && !b.payToasted) {
              b.payToasted = true;
              showToast(
                "Payment Successful",
                `We received your payment of ${peso(b.total)} via ${b.method} for ${what}. Receipt ${b.receipt}. Thank you!`,
                true,
              );
            }
          });
          saveBookings();
          updateNotifBadge();
        }

        // --- CUSTOMER: SEE STATUS ---
        window.openMyBookings = function () {
          if (!requireLogin()) return;
          if (currentUser.role === "Guest") {
            showPane("bookings");
            return;
          }
          const list = $("#myBookingsList");
          list.empty();
          const mine = bookings.filter((b) => b.customer === currentUser.name);
          if (mine.length === 0) {
            list.html(
              '<p class="text-muted text-center m-0 py-3">You have no bookings yet. Click "Avail Service" on a treatment to start.</p>',
            );
          } else {
            mine.forEach((b) => {
              const addonText = b.addons.length
                ? `<div class="small text-muted">Add-ons: ${b.addons.join(", ")}</div>`
                : "";
              list.append(`
                            <div class="p-3 border rounded-3 mb-2 d-flex justify-content-between align-items-center">
                                <div>
                                    <strong>${b.service}</strong>
                                    ${addonText}
                                    <small class="text-muted">${b.time}</small>
                                </div>
                                <div class="text-end">
                                    <span class="badge ${statusBadgeClass(b.status)} rounded-pill px-3 py-2">${b.status}</span>
                                    ${
                                      b.paid
                                        ? `<div class="small text-success fw-semibold mt-1"><i class="fa-solid fa-circle-check me-1"></i>Paid ${peso(b.total)} &middot; ${b.receipt}</div>`
                                        : b.status === "Accepted"
                                          ? '<div class="small text-muted mt-1">Please pay at the counter</div>'
                                          : ""
                                    }
                                </div>
                            </div>
                        `);
            });
          }
          bookings.forEach((b) => {
            if (b.customer === currentUser.name) {
              b.seen = true;
              b.paySeen = true;
            }
          });
          saveBookings();
          updateNotifBadge();
          new bootstrap.Modal(
            document.getElementById("myBookingsModal"),
          ).show();
        };

        // --- IOT SERVICE BUTTON TRIGGER ---
        window.triggerIoTRequest = function (type, cssClass, overrideStation) {
          if (isStaffUser()) return;
          if (!currentUser) {
            alert(
              "Please log in to your account first before using station requests.",
            );
            window.location.assign("login.html");
            return;
          }

          const station = overrideStation || $("#simStationSelect").val();
          const newReq = {
            id: Date.now(),
            station: station,
            type: type,
            cssClass: cssClass,
            time: new Date().toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            }),
          };

          activeIoTRequests.push(newReq);
          totalSignalsCount++;
          updateDashboardQueue();

          $("#statusLed").addClass("active");
          $("#ledStatusText")
            .text("Signal Transmitting...")
            .addClass("text-pink");

          setTimeout(() => {
            $("#statusLed").removeClass("active");
            $("#ledStatusText")
              .text("Station Standby")
              .removeClass("text-pink");
          }, 1800);

          document
            .getElementById("alertChime")
            .play()
            .catch(() => {});

          const simModal = bootstrap.Modal.getInstance(
            document.getElementById("iotSimulatorModal"),
          );
          if (simModal) simModal.hide();
        };

        function updateDashboardQueue() {
          const queue = $("#requestQueue");
          const statusBadge = $("#queueStatusBadge");

          statusBadge.text(`${pendingTotal()} Active Signals`);
          refreshWs();

          if (activeIoTRequests.length === 0) {
            queue.html(`
                        <div class="text-center py-5 bg-white rounded-4 shadow-sm text-muted" id="emptyState">
                            <i class="fa-solid fa-circle-check fs-1 text-pink mb-2 d-block"></i>
                            All station requests are clear.
                        </div>
                    `);
            return;
          }

          queue.empty();
          activeIoTRequests.forEach((req) => {
            queue.append(`
                        <div class="card request-card ${req.cssClass} p-3 pulse-alert">
                            <div class="d-flex justify-content-between align-items-center mb-1">
                                <span class="badge bg-dark rounded-pill">${req.station}</span>
                                <small class="text-muted"><i class="fa-regular fa-clock me-1"></i>${req.time}</small>
                            </div>
                            <h5 class="fw-bold my-2 font-heading">${req.type}</h5>
                            <button class="btn btn-sm btn-pink rounded-pill w-100 mt-2 fw-bold" onclick="acknowledgeRequest(${req.id})">
                                <i class="fa-solid fa-check me-1"></i> Acknowledge
                            </button>
                        </div>
                    `);
          });
        }

        window.acknowledgeRequest = function (id) {
          activeIoTRequests = activeIoTRequests.filter((r) => r.id !== id);
          updateDashboardQueue();
        };

        // --- STAR RATING ---
        $("#starContainer .fa-star").on("click", function () {
          const val = $(this).data("value");
          $("#selectedRating").val(val);

          $("#starContainer .fa-star").each(function (idx) {
            if (idx < val) {
              $(this).removeClass("fa-regular").addClass("fa-solid text-pink");
            } else {
              $(this).removeClass("fa-solid text-pink").addClass("fa-regular");
            }
          });
        });

        $("#feedbackForm").on("submit", function (e) {
          e.preventDefault();
          const rating = parseInt($("#selectedRating").val());
          if (rating === 0) {
            alert("Please select a star rating before submitting.");
            return;
          }

          const newReview = {
            name: $("#feedbackName").val() || "DJ Guest",
            station: $("#feedbackStation").val(),
            rating: rating,
            comment: $("#feedbackComment").val(),
          };

          reviewsData.unshift(newReview);
          renderReviews();
          this.reset();
          $("#starContainer .fa-star")
            .removeClass("fa-solid text-pink")
            .addClass("fa-regular");
          alert("Thank you for your feedback!");
        });

        function renderReviews() {
          const container = $("#reviewsList");
          container.empty();
          reviewsData.forEach((r) => {
            let starsHtml = "";
            for (let i = 1; i <= 5; i++) {
              starsHtml += `<i class="fa-${i <= r.rating ? "solid" : "regular"} fa-star text-pink"></i>`;
            }
            container.append(`
                        <div class="card border-0 shadow-sm p-3 rounded-4 bg-white">
                            <div class="d-flex justify-content-between align-items-center mb-2">
                                <div>
                                    <strong class="me-2">${r.name}</strong>
                                    <span class="badge bg-light text-dark border small">${r.station}</span>
                                </div>
                                <div>${starsHtml}</div>
                            </div>
                            <p class="m-0 text-muted small">"${r.comment}"</p>
                        </div>
                    `);
          });
        }

        // Show saved bookings on load
        renderBookingQueue();
        updateDashboardQueue();

        // Live updates when another tab (e.g. the customer or the staff) changes bookings
        window.addEventListener("storage", function (e) {
          if (e.key !== BOOKINGS_KEY) return;
          const oldIds = bookings.map((b) => b.id);
          bookings = loadBookings();
          renderBookingQueue();
          updateDashboardQueue();
          updateNotifBadge();
          if (
            currentUser &&
            (currentUser.role === "Owner" || currentUser.role === "Staff")
          ) {
            bookings
              .filter((b) => b.status === "Pending" && !oldIds.includes(b.id))
              .forEach((b) => {
                showToast(
                  "New Service Request",
                  `${b.customer} requested ${b.service}${b.addons.length ? " + " + b.addons.join(", ") : ""}. Review it in Notifications.`,
                  true,
                );
                document
                  .getElementById("alertChime")
                  .play()
                  .catch(() => {});
              });
          } else {
            checkNotifications();
          }
        });
      });
