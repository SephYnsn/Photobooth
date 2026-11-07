// Paste your deployed Google Apps Script Web App URL ending in /exec.
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyadSLavPpfutK88ovCLEC-C76EWwjaarHI-_Ui8RJ-FUPe1Qm2n8MSk3lobHjjpbjcUw/exec";


const $ = id => document.getElementById(id);

const welcomeScreen = $("welcomeScreen"), 
      cameraScreen = $("cameraScreen"), 
      previewScreen = $("previewScreen");
const video = $("video"), 
      cameraPlaceholder = $("cameraPlaceholder"), 
      cameraStatus = $("cameraStatus");
const beginSessionBtn = $("beginSessionBtn"), 
      countdownEl = $("countdown"), 
      shotCounter = $("shotCounter");
const shotFlash = $("shotFlash"), 
      stripPreview = $("stripPreview"), 
      uploadState = $("uploadState");
const qrSection = $("qrSection"), 
      uploadError = $("uploadError"), 
      uploadErrorText = $("uploadErrorText");
const downloadBtn = $("downloadBtn"), 
      driveLink = $("driveLink");

let stream = null, 
    selectedFilter = "bw", // Changed default to Black & White
    shots = [], 
    finalBlob = null, 
    finalUrl = null, 
    uploadToken = null, 
    busy = false;

const wait = ms => new Promise(r => setTimeout(r, ms));

const showScreen = s => {
  [welcomeScreen, cameraScreen, previewScreen].forEach(x => x.classList.add("hidden"));
  s.classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
};

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

$("startBtn").addEventListener("click", async () => {
  showScreen(cameraScreen);
  await startCamera();
});

$("backHomeBtn").addEventListener("click", () => showScreen(welcomeScreen));

document.querySelectorAll(".filter").forEach(b => b.addEventListener("click", () => {
  selectedFilter = b.dataset.filter;
  document.querySelectorAll(".filter").forEach(x => x.classList.toggle("active", x === b));
  
  video.style.filter = ({
    original: "none",
    bw: "grayscale(1)",
    vintage: "sepia(.8) contrast(1.1)",
    warm: "sepia(.3) saturate(1.2)",
    vivid: "saturate(1.5) contrast(1.1)"
  })[selectedFilter];
}));

function applyPixelFilter(ctx, w, h, name) {
  if (name === "original") return;
  const im = ctx.getImageData(0, 0, w, h), d = im.data;
  
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i], g = d[i+1], b = d[i+2];
    
    if (name === "bw") {
      r = g = b = .299 * r + .587 * g + .114 * b;
    } else if (name === "vintage") {
      const nr = .393 * r + .769 * g + .189 * b,
            ng = .349 * r + .686 * g + .168 * b,
            nb = .272 * r + .534 * g + .131 * b;
      r = nr * 1.04; g = ng * 1.01; b = nb * .92;
    } else if (name === "warm") {
      r = r * 1.08; g = g * 1.015; b = b * .91;
    } else if (name === "vivid") {
      const a = (r + g + b) / 3;
      r = (a + (r - a) * 1.35 - 128) * 1.08 + 128;
      g = (a + (g - a) * 1.35 - 128) * 1.08 + 128;
      b = (a + (b - a) * 1.35 - 128) * 1.08 + 128;
    }
    
    d[i] = Math.max(0, Math.min(255, r));
    d[i+1] = Math.max(0, Math.min(255, g));
    d[i+2] = Math.max(0, Math.min(255, b));
  }
  ctx.putImageData(im, 0, 0);
}

function captureFrame() {
  const w = 720, 
        h = Math.round(w * video.videoHeight / video.videoWidth), 
        c = document.createElement("canvas");
  
  c.width = w; c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  
  ctx.translate(w, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, w, h);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  applyPixelFilter(ctx, w, h, selectedFilter);
  
  return c;
}

async function countdown() {
  for (let n = 3; n >= 1; n--) {
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

async function makeStrip() {
  const pw = 720, 
        ph = shots[0].height, 
        m = 32, 
        g = 20, 
        head = 95, 
        foot = 85, 
        c = document.createElement("canvas");
        
  c.width = pw + 2 * m;
  c.height = head + m + ph * 4 + g * 3 + foot + m;
  
  const x = c.getContext("2d");
  
  // Background - Aged paper color
  x.fillStyle = "#eee9dd";
  x.fillRect(0, 0, c.width, c.height);
  
  // Border around the whole strip
  x.strokeStyle = "#111111";
  x.lineWidth = 4;
  x.strokeRect(8, 8, c.width - 16, c.height - 16);
  x.lineWidth = 1;
  x.strokeRect(14, 14, c.width - 28, c.height - 28);
  
  x.textAlign = "center";
  x.fillStyle = "#111111"; // Black ink
  
  // Headline font
  x.font = "bold 34px Georgia, serif"; 
  x.fillText("THE SNAP STUDIO TIMES", c.width / 2, 55);
  
  // Subheading font
  x.font = "bold 13px 'Courier New', monospace";
  x.fillText("VOL 1. — PRICE: 1 SMILE", c.width / 2, 78);
  
  // Draw line under header
  x.beginPath();
  x.moveTo(m, 90);
  x.lineTo(c.width - m, 90);
  x.stroke();
  
  shots.forEach((s, i) => {
    const y = head + m + i * (ph + g);
    x.drawImage(s, m, y, pw, ph);
    
    // Thick black border around photos
    x.strokeStyle = "#111111";
    x.lineWidth = 3;
    x.strokeRect(m, y, pw, ph);
  });
  
  // Footer text
  x.font = "bold 14px 'Courier New', monospace";
  x.fillText("PRINTED ON LOCATION", c.width / 2, c.height - 45);
  
  finalBlob = await toBlob(c);
  if (finalUrl) URL.revokeObjectURL(finalUrl);
  
  finalUrl = URL.createObjectURL(finalBlob);
  stripPreview.src = finalUrl;
  
  downloadBtn.href = finalUrl;
  downloadBtn.classList.remove("disabled");
  downloadBtn.setAttribute("aria-disabled", "false");
}

async function takeFour() {
  if (busy || !stream || !video.videoWidth) return;
  
  busy = true;
  beginSessionBtn.disabled = true;
  shots = [];
  cameraStatus.textContent = "Get ready!";
  
  try {
    for (let i = 0; i < 4; i++) {
      cameraStatus.textContent = `Get ready for exposure ${i + 1} of 4...`;
      await countdown();
      
      shots.push(captureFrame());
      shotCounter.textContent = `EXPOSURE ${shots.length} / 4`;
      
      shotFlash.classList.remove("flash");
      void shotFlash.offsetWidth; // Trigger reflow
      shotFlash.classList.add("flash");
      
      if (i < 3) await wait(900);
    }
    
    cameraStatus.textContent = "Developing your photo strip...";
    await makeStrip();
    showScreen(previewScreen);
    uploadStrip();
  } catch (e) {
    console.error(e);
    cameraStatus.textContent = e.message;
    beginSessionBtn.disabled = false;
  } finally {
    busy = false;
  }
}

beginSessionBtn.addEventListener("click", takeFour);

function getUploadStatus(token) {
  return new Promise((resolve, reject) => {
    const cb = "snapCallback_" + token.replace(/[^a-zA-Z0-9_]/g, ""), 
          s = document.createElement("script");
    let done = false;
    
    const timer = setTimeout(() => finish(new Error("Timed out waiting for server.")), 9000);
    
    function finish(err, data) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      delete window[cb];
      s.remove();
      err ? reject(err) : resolve(data);
    }
    
    window[cb] = data => finish(null, data);
    s.onerror = () => finish(new Error("Could not check upload status."));
    s.src = `${GOOGLE_SCRIPT_URL}?action=status&token=${encodeURIComponent(token)}&callback=${cb}&_=${Date.now()}`;
    document.body.appendChild(s);
  });
}

async function uploadStrip() {
  if (!finalBlob) return;
  
  if (!GOOGLE_SCRIPT_URL || GOOGLE_SCRIPT_URL.includes("PASTE_YOUR")) {
    showUploadError("Add your deployed Apps Script URL to script.js.");
    return;
  }
  
  uploadState.classList.remove("hidden");
  qrSection.classList.add("hidden");
  uploadError.classList.add("hidden");
  uploadToken = "snap_" + Date.now() + "_" + Math.random().toString(36).slice(2, 10);
  
  try {
    const dataUrl = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(new Error("Could not read photo strip."));
      r.readAsDataURL(finalBlob);
    });
    
    fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ image: dataUrl, token: uploadToken })
    }).catch(console.warn);
    
    let result = null;
    for (let i = 0; i < 20; i++) {
      await wait(1800);
      try {
        result = await getUploadStatus(uploadToken);
        if (result && result.status !== "pending") break;
      } catch (e) { console.warn(e); }
    }
    
    if (!result || result.status !== "success" || !result.url) {
      throw new Error(result?.error || "Server did not confirm the upload. Please retry.");
    }
    
    uploadState.classList.add("hidden");
    qrSection.classList.remove("hidden");
    driveLink.href = result.url;
    $("qrcode").innerHTML = "";
    
    if (window.QRCode) {
      new QRCode($("qrcode"), { 
        text: result.url, 
        width: 180, 
        height: 180, 
        colorDark: "#111111", 
        colorLight: "#ffffff", 
        correctLevel: QRCode.CorrectLevel.M 
      });
    } else {
      $("qrcode").textContent = "QR library unavailable. Use the link below.";
    }
  } catch (e) {
    showUploadError(e.message);
  }
}

function showUploadError(message) {
  uploadState.classList.add("hidden");
  uploadError.classList.remove("hidden");
  uploadErrorText.textContent = message;
}

$("retryUploadBtn").addEventListener("click", uploadStrip);
$("againBtn").addEventListener("click", () => {
  shots = [];
  shotCounter.textContent = "EXPOSURE 0 / 4";
  showScreen(cameraScreen);
  if (!stream || !stream.active) startCamera();
});

window.addEventListener("beforeunload", () => {
  if (stream) stream.getTracks().forEach(t => t.stop());
  if (finalUrl) URL.revokeObjectURL(finalUrl);
});