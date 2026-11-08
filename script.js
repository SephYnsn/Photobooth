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
    selectedTimer = 3, // NEW: Default timer is 3 seconds
    selectedTemplateId = "classic_strip",
    shots = [], 
    finalBlob = null, 
    finalUrl = null, 
    uploadToken = null, 
    busy = false;
    activeCode = "",       // Stores the validated ticket code
    currentInput = "";

const wait = ms => new Promise(r => setTimeout(r, ms));
const loadImage = src => new Promise((res, rej) => {
  const img = new Image();
  img.onload = () => res(img);
  img.onerror = () => rej(new Error(`Failed to load template image: ${src}`));
  img.src = src;
});

const showScreen = s => {
  // Add printingScreen here so it correctly hides!
  [welcomeScreen, ticketScreen, templateScreen, cameraScreen, printingScreen, previewScreen].forEach(x => x.classList.add("hidden"));
  s.classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
};

// =========================================================
// TEMPLATE REGISTRY (Configure your Canva PNGs here)
// =========================================================
const templates = {
  front_page2: {
    name: "Front Page1",
    shotsRequired: 2,
    bgUrl: "assets/newspaper_template2.png", // Name of your transparent Canva PNG in the folder
    width:  794 ,
    height: 1123,
    // (x, y, width, height) defining exactly where each photo belongs on the PNG
    slots: [
      { x: 45.42992125984252, y: 225.37322834645673, w: 498.14173228346465, h: 389.25354330708666 },
      { x: 45.42992125984252, y: 766.8661417322836, w: 249.25984251968507, h: 255.00472440944884 },
      
    ]
  }, 
  front_page1: {
    name: "Front Page2",
    shotsRequired: 1,
    bgUrl: "assets/newspaper_template1.png", // Name of your transparent Canva PNG in the folder
    width: 1080,
    height: 1527,
    slots: [
      { x: 80, y: 350, w: 920, h: 690 } // Just one photo slot for this template
    ]
  }
};

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
async function renderTemplate(template, capturedShots) {
  const c = document.createElement("canvas");
  c.width = template.width;
  c.height = template.height;
  const ctx = c.getContext("2d");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, c.width, c.height);

  template.slots.forEach((slot, index) => {
    if (capturedShots[index]) {
      drawCropped(ctx, capturedShots[index], slot.x, slot.y, slot.w, slot.h);
    }
  });

  if (!template.imgObj) template.imgObj = await loadImage(template.bgUrl);
  ctx.drawImage(template.imgObj, 0, 0, template.width, template.height);
  return c;
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
      activeCode = currentInput; // Save the validated code!
      showScreen(templateScreen);
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
      if (i < totalShots - 1) await wait(900);
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