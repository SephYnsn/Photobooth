// Paste your deployed Google Apps Script Web App URL ending in /exec.
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyadSLavPpfutK88ovCLEC-C76EWwjaarHI-_Ui8RJ-FUPe1Qm2n8MSk3lobHjjpbjcUw/exec";

const $ = id => document.getElementById(id);

// Screens
const welcomeScreen = $("welcomeScreen"),
      ticketScreen = $("ticketScreen"),
      templateScreen = $("templateScreen"),
      cameraScreen = $("cameraScreen"), 
      previewScreen = $("previewScreen");

// Elements
const video = $("video"), 
      cameraPlaceholder = $("cameraPlaceholder"), 
      cameraStatus = $("cameraStatus");
const beginSessionBtn = $("beginSessionBtn"), 
      countdownEl = $("countdown"), 
      shotCounter = $("shotCounter"),
      backToTemplatesBtn = $("backToTemplatesBtn"); // NEW: Grab the back button
      livePreviewCanvas = $("livePreviewCanvas"); // NEW: Grab the preview image
const shotFlash = $("shotFlash"), 
      stripPreview = $("stripPreview"), 
      uploadState = $("uploadState");
const qrSection = $("qrSection"), 
      uploadError = $("uploadError"), 
      uploadErrorText = $("uploadErrorText");
const downloadBtn = $("downloadBtn"), 
      driveLink = $("driveLink");



// State
// State
let stream = null, 
    selectedFilter = "bw",
    selectedTimer = 10, // NEW: Default timer is 3 seconds
    selectedTemplateId = "classic_strip",
    shots = [], 
    finalBlob = null, 
    finalUrl = null, 
    uploadToken = null, 
    busy = false;
    activeCode = "",       // Stores the validated ticket code
    activePackage = "",
    currentInput = "";

const wait = ms => new Promise(r => setTimeout(r, ms));
const loadImage = src => new Promise((res, rej) => {
  const img = new Image();
  img.onload = () => res(img);
  img.onerror = () => rej(new Error(`Failed to load template image: ${src}`));
  img.src = src;
});

const showScreen = async (s) => {
  const allScreens = [welcomeScreen, ticketScreen, templateScreen, cameraScreen, printingScreen, previewScreen];
  
  // Find which screens are currently visible
  const activeScreens = allScreens.filter(x => !x.classList.contains("hidden"));
  
  // 1. Add the fade-out class to the active screens
  activeScreens.forEach(x => x.classList.add("fade-out"));
  
  // 2. Wait for the CSS fade-out animation to finish (200ms matches the CSS)
  if (activeScreens.length > 0) {
    await wait(200); 
  }
  
  // 3. Hide all screens and clean up the fade-out class
  allScreens.forEach(x => {
    x.classList.add("hidden");
    x.classList.remove("fade-out");
  });
  
  // 4. Show the new screen (The CSS screenFadeIn animation plays automatically!)
  s.classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
};

// =========================================================
// TEMPLATE REGISTRY (Configure your Canva PNGs here)
// =========================================================
const templates = {

  front_page1: {
    name: "Front Page1",
    shotsRequired: 2,
    bgUrl: "assets/Newspaper1.png",
    width: 794,
    height: 1123,
    slots: [
      { x: 45.3, y: 225.9, w: 498.8, h: 386.4 },
      { x:43.6 , y: 767.2 , w: 252.7, h: 258 } 
      //{ x: , y: , w: , h: } // Just one photo slot for this template
    ]
  },


  front_page2: {
    name: "Front Page2",
    shotsRequired: 2,
    bgUrl: "assets/Newspaper2.png", // Name of your transparent Canva PNG in the folder
    width:  794 ,
    height: 1123,
    // (x, y, width, height) defining exactly where each photo belongs on the PNG
    slots: [
      { x: 45, y: 225.9 , w:703.6 , h:386.4 },
      { x: 45.2, y:767.2 , w: 251.1 , h: 255.1} 
      
    ]
  },
  
  
  front_page3: {
    name: "Front Page3",
    shotsRequired: 3,
    bgUrl: "assets/Newspaper3.png", // Name of your transparent Canva PNG in the folder
    width:  794 ,
    height: 1123,
    // (x, y, width, height) defining exactly where each photo belongs on the PNG
    slots: [
      { x: 354.6 , y: 153.4 , w: 394 , h: 322.8},
      { x: 25.1, y:520.6 , w: 256.3, h: 198.9 }, 
      { x: 264, y:774.7 , w: 256.3, h: 260.9 }
    ]
  },


 
  wanted_poster: {
    name: "Wanter Poster",
    shotsRequired: 1,
    bgUrl: "assets/wanted_template.png", // Name of your transparent Canva PNG in the folder
    width: 794,
    height: 1123,
    slots: [
      { x: 27.590551181102363, y: 224.27716535433075, w: 729.6, h: 499.5779527559056 } // Just one photo slot for this template
    ]
  },

  package11: {
    name: "Package 11",
    shotsRequired: 4,
    bgUrl: "assets/Package1.1.png", // Name of your transparent Canva PNG in the folder
    width: 1200,
    height: 3600,
    slots: [
      { x: 99.3, y: 270.7 , w:  996.1, h: 595.6 },
      { x: 101.9, y: 969.4, w:  996.1, h: 600.6 },
      { x: 101.9, y: 1668.2, w:  996.1, h: 595.6  },
      { x: 99.3, y: 2364.7, w:  996.1, h: 595.6 }


    ]
  },


  package12: {
    name: "Package 12",
    shotsRequired: 3,
    bgUrl: "assets/Package1.2.png", // Name of your transparent Canva PNG in the folder
    width: 1200,
    height: 3600,
    slots: [
      { x:180.8, y: 594, w: 846.6, h: 761 }, 
      { x: 180.8, y: 1409.9, w: 846.6, h: 744.1 },
      { x: 176.7, y: 2209.4, w: 846.6, h: 761 }
    ]
  },


  package13: {
    name: "Package 13",
    shotsRequired: 3,
    bgUrl: "assets/Package1.3.png", // Name of your transparent Canva PNG in the folder
    width: 1200,
    height: 3600,
    slots: [
      { x: 58.3, y: 618.2, w: 1083.4, h: 627.6 },
      { x: 58.3, y: 1301.4, w: 1083.4, h: 627.6 },
      { x: 58.3, y: 2265.7, w: 1083.4, h: 627.6 }

    ]
  },


  package14: {
    name: "Package 14",
    shotsRequired: 3,
    bgUrl: "assets/Package1.4.png", // Name of your transparent Canva PNG in the folder
    width: 1200,
    height: 3600,
    slots: [
      { x: 0, y: 159.3, w: 1200, h:  668.1 },
      { x: 0, y: 986.8, w: 1200 , h: 668.1 },
      { x: 0, y: 1800, w: 1200, h: 712 }

    ]
  },


  package15: {
    name: "Package 15",
    shotsRequired: 4,
    bgUrl: "assets/Package1.5.png", // Name of your transparent Canva PNG in the folder
    width: 1200,
    height: 3600,
    slots: [
      { x: 134.2, y: 405.4, w:  950.5, h: 566.8 },
      { x: 137.3, y: 1160.3, w:  950.5, h: 572 },
      { x: 140.1, y: 1922.6, w:  950.5, h: 572  },
      { x: 141.1, y: 2685.3, w:  950.5, h: 572 }
    
      

    ]
  }



}






// Universal rendering engine for Canva PNGs (Anti-Squish Version)
// Helper: Anti-Squish Cropping Logic (Handles both Static Images and Live Video)
function drawCropped(ctx, source, sx, sy, sw, sh) {
  const srcW = source.videoWidth || source.width;
  const srcH = source.videoHeight || source.height;
  if (!srcW || !srcH) return; // Prevent errors if video isn't ready

  const sourceRatio = srcW / srcH;
  const targetRatio = sw / sh;
  
  let cropX = 0, cropY = 0, cropW = srcW, cropH = srcH;

  if (sourceRatio > targetRatio) {
    cropW = srcH * targetRatio;
    cropX = (srcW - cropW) / 2;
  } else {
    cropH = cropW / targetRatio;
    cropY = (srcH - cropH) / 2;
  }

  ctx.drawImage(source, cropX, cropY, cropW, cropH, sx, sy, sw, sh);
}

// Generates the final static print for download/upload
// Generates the final static print for download/upload (Supports Package 2 Double Strip)
async function renderTemplate(template, capturedShots) {
  const singleCanvas = document.createElement("canvas");
  singleCanvas.width = template.width;
  singleCanvas.height = template.height;
  const sCtx = singleCanvas.getContext("2d");

  sCtx.fillStyle = "#ffffff";
  sCtx.fillRect(0, 0, singleCanvas.width, singleCanvas.height);

  template.slots.forEach((slot, index) => {
    if (capturedShots[index]) {
      drawCropped(sCtx, capturedShots[index], slot.x, slot.y, slot.w, slot.h);
    }
  });

  if (!template.imgObj) template.imgObj = await loadImage(template.bgUrl);
  sCtx.drawImage(template.imgObj, 0, 0, template.width, template.height);

  // If Package 2 is active, duplicate side-by-side with a cutting guide
  if (activePackage === "2") {
    const doubleCanvas = document.createElement("canvas");
    const dCtx = doubleCanvas.getContext("2d");
    
    const gap = 40; // Gap between strips for easy paper cutting
    doubleCanvas.width = (singleCanvas.width * 2) + gap;
    doubleCanvas.height = singleCanvas.height;
    
    dCtx.fillStyle = "#ffffff";
    dCtx.fillRect(0, 0, doubleCanvas.width, doubleCanvas.height);
    
    // Draw Strip 1 on the left
    dCtx.drawImage(singleCanvas, 0, 0);
    
    // Draw Strip 2 on the right
    dCtx.drawImage(singleCanvas, singleCanvas.width + gap, 0);
    
    // Dashed center cutting guideline
    dCtx.strokeStyle = "#111111";
    dCtx.lineWidth = 3;
    dCtx.setLineDash([10, 10]);
    dCtx.beginPath();
    dCtx.moveTo(singleCanvas.width + (gap / 2), 30);
    dCtx.lineTo(singleCanvas.width + (gap / 2), doubleCanvas.height - 30);
    dCtx.stroke();
    
    return doubleCanvas;
  }

  return singleCanvas;
}


// NEW: Real-Time Canvas Loop for the Sidebar
let previewLoopId = null;

async function startLivePreviewLoop() {
  const currentTemplate = templates[selectedTemplateId];
  const ctx = livePreviewCanvas.getContext("2d");
  livePreviewCanvas.width = currentTemplate.width;
  livePreviewCanvas.height = currentTemplate.height;

  // Pre-load the Canva frame so it doesn't flicker
  if (!currentTemplate.imgObj) {
    currentTemplate.imgObj = await loadImage(currentTemplate.bgUrl);
  }

  function loop() {
    // 1. Draw solid white base
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, livePreviewCanvas.width, livePreviewCanvas.height);

    // 2. Draw slots (Captured photos + Live Video)
   // 2. Draw slots (Captured photos + Live Video)
    currentTemplate.slots.forEach((slot, i) => {
      if (shots[i]) {
        // Draw already taken photo
        ctx.filter = "none";
        drawCropped(ctx, shots[i], slot.x, slot.y, slot.w, slot.h);
      } else if (i === shots.length && stream && stream.active) {
        // Draw LIVE VIDEO feed in the next available slot
        ctx.save();
        
        // FIX: Provide the exact string directly to the canvas instead of reading the video style
        const filterStrings = {
          original: "none", 
          bw: "grayscale(1)", 
          vintage: "sepia(.8) contrast(1.1)",
          warm: "sepia(.3) saturate(1.2)", 
          vivid: "saturate(1.5) contrast(1.1)"
        };
        ctx.filter = filterStrings[selectedFilter]; 
        
        // Mirror the live video so it acts like a mirror
        ctx.translate(slot.x + slot.w, slot.y);
        ctx.scale(-1, 1);
        drawCropped(ctx, video, 0, 0, slot.w, slot.h);
        
        ctx.restore();
      }
    });

    // 3. Draw Canva PNG overlay
    ctx.drawImage(currentTemplate.imgObj, 0, 0, livePreviewCanvas.width, livePreviewCanvas.height);

    previewLoopId = requestAnimationFrame(loop);
  }

  if (previewLoopId) cancelAnimationFrame(previewLoopId);
  loop();
}
// =========================================================
// NAVIGATION & EVENTS
// =========================================================

$("startBtn").addEventListener("click", () => {
  currentInput = "";
  $("ticketDisplay").textContent = "";
  $("ticketError").textContent = "";
  showScreen(ticketScreen);
});
$("backFromTicketBtn").addEventListener("click", () => showScreen(welcomeScreen));
$("backToWelcomeBtn").addEventListener("click", () => showScreen(welcomeScreen));
$("backToTemplatesBtn").addEventListener("click", () => showScreen(templateScreen));

// Handle template selection from the grid
// Handle template selection from the grid
document.querySelectorAll(".template-card").forEach(card => {
  card.addEventListener("click", async () => {
    selectedTemplateId = card.dataset.template;
    const templateData = templates[selectedTemplateId];
    
    shots = [];
    shotCounter.textContent = `SHOTS 0 / ${templateData.shotsRequired}`;
    beginSessionBtn.disabled = false;
    cameraStatus.textContent = "Camera ready! Start your press session.";
    
    showScreen(cameraScreen);
    if (!stream || !stream.active) await startCamera();
    
    // NEW: Start the live drawing loop
    startLivePreviewLoop();
  });
});

// Handle Timer selection
document.querySelectorAll(".timer-btn").forEach(b => b.addEventListener("click", () => {
  selectedTimer = parseInt(b.dataset.time);
  document.querySelectorAll(".timer-btn").forEach(x => x.classList.toggle("active", x === b));
}));




async function startCamera() {
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera access needs HTTPS or localhost.");
    stream = await navigator.mediaDevices.getUserMedia({ 
      video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 960 } }, 
      audio: false 
    });
    video.srcObject = stream;
    await video.play();
    cameraPlaceholder.classList.add("hidden");
    beginSessionBtn.disabled = false;
    cameraStatus.textContent = "Camera ready! Start your press session.";
  } catch (e) {
    cameraStatus.textContent = e.message || "Camera access was denied. Check browser permissions.";
  }
}

document.querySelectorAll(".filter").forEach(b => b.addEventListener("click", () => {
  selectedFilter = b.dataset.filter;
  document.querySelectorAll(".filter").forEach(x => x.classList.toggle("active", x === b));
  video.style.filter = ({
    original: "none", bw: "grayscale(1)", vintage: "sepia(.8) contrast(1.1)",
    warm: "sepia(.3) saturate(1.2)", vivid: "saturate(1.5) contrast(1.1)"
  })[selectedFilter];
}));





// =========================================================
// TICKET & NUMPAD LOGIC
// =========================================================
document.querySelectorAll(".num-btn:not(#btnDel):not(#btnEnter)").forEach(btn => {
  btn.addEventListener("click", () => {
    if (currentInput.length < 10) {
      currentInput += btn.textContent;
      $("ticketDisplay").textContent = currentInput;
      $("ticketError").textContent = "";
    }
  });
});

$("btnDel").addEventListener("click", () => {
  currentInput = currentInput.slice(0, -1);
  $("ticketDisplay").textContent = currentInput || "";
});

function verifyTicketOnServer(code) {
  return new Promise((resolve, reject) => {
    const cb = "verifyCb_" + Date.now();
    const s = document.createElement("script");
    let done = false;
    const timer = setTimeout(() => finish(new Error("Timeout waiting for verification")), 8000);
    
    function finish(err, data) {
      if (done) return; 
      done = true; 
      clearTimeout(timer); 
      delete window[cb]; 
      s.remove();
      err ? reject(err) : resolve(data);
    }
    
    window[cb] = data => finish(null, data);
    s.onerror = () => finish(new Error("Network error"));
    s.src = `${GOOGLE_SCRIPT_URL}?action=verify&code=${encodeURIComponent(code)}&callback=${cb}&_=${Date.now()}`;
    document.body.appendChild(s);
  });
}

$("btnEnter").addEventListener("click", async () => {
  if (!currentInput) return;
  
  $("ticketDisplay").textContent = "VERIFYING...";
  $("ticketError").textContent = "";
  const enterBtn = $("btnEnter");
  enterBtn.disabled = true;

  try {
    const result = await verifyTicketOnServer(currentInput);
    if (result.valid) {
      activeCode = currentInput; 
      activePackage = String(result.package)
      
      // NEW: Filter the layout options based on the package
      const userPackage = String(result.package); // Will be "1", "2", or "master"
      
      // Find all elements in the HTML that have a data-package attribute
      document.querySelectorAll("[data-package]").forEach(layoutBtn => {
        const btnPackage = layoutBtn.getAttribute("data-package");
        
        // If they used the master PIN, or if the layout matches their ticket's package, show it
        if (userPackage === "master" || userPackage === btnPackage) {
          layoutBtn.style.display = ""; // Shows the layout
        } else {
          layoutBtn.style.display = "none"; // Hides the layout
        }
      });

      await showScreen(templateScreen);
      
    } else {
      $("ticketDisplay").textContent = currentInput;
      $("ticketError").textContent = result.message || "Invalid Code";
    }
  } catch (e) {
    $("ticketDisplay").textContent = currentInput;
    $("ticketError").textContent = "Connection error. Try again.";
  } finally {
    enterBtn.disabled = false;
  }
});


// =========================================================
// CAMERA LOGIC
// =========================================================

function applyPixelFilter(ctx, w, h, name) {
  if (name === "original") return;
  const im = ctx.getImageData(0, 0, w, h), d = im.data;
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i], g = d[i+1], b = d[i+2];
    if (name === "bw") {
      r = g = b = .299 * r + .587 * g + .114 * b;
    } else if (name === "vintage") {
      const nr = .393 * r + .769 * g + .189 * b, ng = .349 * r + .686 * g + .168 * b, nb = .272 * r + .534 * g + .131 * b;
      r = nr * 1.04; g = ng * 1.01; b = nb * .92;
    } else if (name === "warm") {
      r = r * 1.08; g = g * 1.015; b = b * .91;
    } else if (name === "vivid") {
      const a = (r + g + b) / 3; r = (a + (r - a) * 1.35 - 128) * 1.08 + 128; g = (a + (g - a) * 1.35 - 128) * 1.08 + 128; b = (a + (b - a) * 1.35 - 128) * 1.08 + 128;
    }
    d[i] = Math.max(0, Math.min(255, r)); d[i+1] = Math.max(0, Math.min(255, g)); d[i+2] = Math.max(0, Math.min(255, b));
  }
  ctx.putImageData(im, 0, 0);
}

function captureFrame() {
  const w = 720, h = Math.round(w * video.videoHeight / video.videoWidth), c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.translate(w, 0); ctx.scale(-1, 1); ctx.drawImage(video, 0, 0, w, h); ctx.setTransform(1, 0, 0, 1, 0, 0);
  applyPixelFilter(ctx, w, h, selectedFilter);
  return c;
}

async function countdown() {
  for (let n = selectedTimer; n >= 1; n--) {
    countdownEl.textContent = n; 
    countdownEl.classList.remove("hidden"); 
    await wait(850);
  }
  countdownEl.textContent = "📸"; 
  await wait(250); 
  countdownEl.classList.add("hidden");
}

function toBlob(c) {
  return new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error("Could not create image.")), "image/png"));
}






async function startSession() {
  if (busy || !stream || !video.videoWidth) return;
  busy = true;
  beginSessionBtn.disabled = true;
  backToTemplatesBtn.disabled = true; // Lock the layout button during session
  shots = [];
  
  const currentTemplate = templates[selectedTemplateId];
  const totalShots = currentTemplate.shotsRequired;
  
  cameraStatus.textContent = "Get ready!";
  
  try {
    for (let i = 0; i < totalShots; i++) {
      cameraStatus.textContent = `Get ready for exposure ${i + 1} of ${totalShots}...`;
      
      // Wait for the countdown
      await countdown();
      
      // Take the photo and update the counter
      shots.push(captureFrame());
      shotCounter.textContent = `SHOTS ${shots.length} / ${totalShots}`;
      
      // Fire the camera flash
      shotFlash.classList.remove("flash");
      void shotFlash.offsetWidth; // Trigger reflow so the animation restarts
      shotFlash.classList.add("flash");
      
      // Wait a moment before starting the next countdown (if not the last shot)
      if (i < totalShots - 1) await wait(1000);
    }
    
    cameraStatus.textContent = "Developing your print...";
    
    // Render the final high-res PNG template + photos
    const renderedCanvas = await renderTemplate(currentTemplate, shots);
    finalBlob = await toBlob(renderedCanvas);
    
   // (Inside startSession() try block...)
    // Create the download URL
    if (finalUrl) URL.revokeObjectURL(finalUrl);
    finalUrl = URL.createObjectURL(finalBlob);
    
    // Set both the printer image and the final preview image
    printingPaper.src = finalUrl;
    stripPreview.src = finalUrl;
    downloadBtn.href = finalUrl;
    downloadBtn.classList.remove("disabled");
    downloadBtn.setAttribute("aria-disabled", "false");
    
    // NEW: Show the printing animation screen!
    showScreen(printingScreen);
    
    // Trigger the slide-out CSS animation
    printingPaper.classList.remove("print-out");
    void printingPaper.offsetWidth; // reflow
    printingPaper.classList.add("print-out");
    
    // Wait for the animation to finish (7.5 seconds), then go to preview & upload
    setTimeout(() => {
      showScreen(previewScreen);
      uploadStrip();

      printingPaper.classList.remove("print-out");
    }, 7500); 
    
  } catch (e) {
    console.error("Camera session error:", e);
    cameraStatus.textContent = e.message;
    beginSessionBtn.disabled = false;
  } finally {
    busy = false;
    backToTemplatesBtn.disabled = false; // Unlock the layout button
  }
}

beginSessionBtn.addEventListener("click", startSession);

// =========================================================
// UPLOAD LOGIC
// =========================================================

function getUploadStatus(token) {
  return new Promise((resolve, reject) => {
    const cb = "snapCallback_" + token.replace(/[^a-zA-Z0-9_]/g, ""), s = document.createElement("script");
    let done = false;
    const timer = setTimeout(() => finish(new Error("Timed out waiting for server.")), 9000);
    function finish(err, data) { if (done) return; done = true; clearTimeout(timer); delete window[cb]; s.remove(); err ? reject(err) : resolve(data); }
    window[cb] = data => finish(null, data);
    s.onerror = () => finish(new Error("Could not check upload status."));
    s.src = `${GOOGLE_SCRIPT_URL}?action=status&token=${encodeURIComponent(token)}&callback=${cb}&_=${Date.now()}`;
    document.body.appendChild(s);
  });
}

async function uploadStrip() {
  if (!finalBlob) return;
  if (!GOOGLE_SCRIPT_URL || GOOGLE_SCRIPT_URL.includes("PASTE_YOUR")) {
    showUploadError("Add your deployed Apps Script URL to script.js."); return;
  }
  
  uploadState.classList.remove("hidden"); qrSection.classList.add("hidden"); uploadError.classList.add("hidden");
  uploadToken = "snap_" + Date.now() + "_" + Math.random().toString(36).slice(2, 10);
  
  try {
    const dataUrl = await new Promise((resolve, reject) => {
      const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(new Error("Could not read print.")); r.readAsDataURL(finalBlob);
    });
    // IN uploadStrip()
    fetch(GOOGLE_SCRIPT_URL, { 
      method: "POST", 
      mode: "no-cors", 
      headers: { "Content-Type": "text/plain" }, 
      body: JSON.stringify({ image: dataUrl, token: uploadToken, ticketCode: activeCode }) // <-- Added activeCode here
    }).catch(console.warn);
    
    let result = null;
    for (let i = 0; i < 20; i++) {
      await wait(1800);
      try { result = await getUploadStatus(uploadToken); if (result && result.status !== "pending") break; } catch (e) { console.warn(e); }
    }
    if (!result || result.status !== "success" || !result.url) throw new Error(result?.error || "Server did not confirm the upload. Please retry.");
    
    uploadState.classList.add("hidden"); qrSection.classList.remove("hidden"); driveLink.href = result.url; $("qrcode").innerHTML = "";
    if (window.QRCode) { new QRCode($("qrcode"), { text: result.url, width: 180, height: 180, colorDark: "#111111", colorLight: "#ffffff", correctLevel: QRCode.CorrectLevel.M }); } 
    else { $("qrcode").textContent = "QR library unavailable. Use the link below."; }
  } catch (e) {
    showUploadError(e.message);
  }
}

function showUploadError(message) { uploadState.classList.add("hidden"); uploadError.classList.remove("hidden"); uploadErrorText.textContent = message; }
$("retryUploadBtn").addEventListener("click", uploadStrip);

// Return to front page after session
// Return to front page after session to require a new ticket
$("againBtn").addEventListener("click", () => { 
  activeCode = ""; // Clear the used ticket!
  showScreen(welcomeScreen); 
});

window.addEventListener("beforeunload", () => {
  if (stream) stream.getTracks().forEach(t => t.stop());
  if (finalUrl) URL.revokeObjectURL(finalUrl);
});






// =========================================================
// WELCOME SCREEN SLIDESHOW
// =========================================================
const slideshowImg = $("welcomeSlideshow");

if (slideshowImg) {
  // Extract all the template URLs from our templates object
  const templateUrls = Object.values(templates).map(t => t.bgUrl);
  let slideIndex = 0;

  if (templateUrls.length > 1) {
    setInterval(() => {
      // 1. Fade out
      slideshowImg.style.opacity = 0;
      
      // 2. Wait for fade, swap image, fade back in
      setTimeout(() => {
        slideIndex = (slideIndex + 1) % templateUrls.length;
        slideshowImg.src = templateUrls[slideIndex];
        slideshowImg.style.opacity = 1;
      }, 500); // 300ms matches the CSS transition time
      
    }, 5000); // Change image every 3 seconds
  }
}