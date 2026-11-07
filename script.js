const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const photo = document.getElementById('photo');
const cameraMessage = document.getElementById('cameraMessage');
const startBtn = document.getElementById('startBtn');
const captureBtn = document.getElementById('captureBtn');
const retakeBtn = document.getElementById('retakeBtn');
const downloadBtn = document.getElementById('downloadBtn');
const statusText = document.getElementById('status');

let stream = null;
let selectedFilter = 'none';
let photoUrl = null;

async function startCamera() {
  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Camera access is unavailable. Open this page on localhost or HTTPS.');
    }
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user' },
      audio: false
    });
    video.srcObject = stream;
    video.hidden = false;
    photo.hidden = true;
    cameraMessage.hidden = true;
    captureBtn.disabled = false;
    startBtn.textContent = 'Camera on';
    statusText.textContent = 'Camera ready — choose a filter and take your photo.';
  } catch (error) {
    cameraMessage.hidden = false;
    cameraMessage.textContent = error.message || 'Could not access the camera. Check your browser permissions.';
    statusText.textContent = 'Please allow camera access, then try again.';
  }
}

function chooseFilter(filter) {
  selectedFilter = filter;
  video.style.filter = filter;
  photo.style.filter = filter;
  document.querySelectorAll('.filter').forEach(button => {
    button.classList.toggle('active', button.dataset.filter === filter);
  });
}

document.querySelectorAll('.filter').forEach(button => {
  button.addEventListener('click', () => chooseFilter(button.dataset.filter));
});

function capturePhoto() {
  if (!stream || !video.videoWidth) return;

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const context = canvas.getContext('2d');

  // Mirror the saved image to match the selfie preview.
  context.translate(canvas.width, 0);
  context.scale(-1, 1);
  context.filter = selectedFilter;
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.filter = 'none';

  if (photoUrl) URL.revokeObjectURL(photoUrl);
  canvas.toBlob(blob => {
    if (!blob) {
      statusText.textContent = 'Could not create the photo. Please try again.';
      return;
    }
    photoUrl = URL.createObjectURL(blob);
    photo.src = photoUrl;
    photo.style.filter = 'none'; // Filter is already applied to the saved image.
    photo.hidden = false;
    video.hidden = true;
    retakeBtn.disabled = false;
    captureBtn.disabled = true;
    downloadBtn.href = photoUrl;
    downloadBtn.download = 'snap-studio-photo.png';
    downloadBtn.classList.remove('disabled');
    downloadBtn.setAttribute('aria-disabled', 'false');
    statusText.textContent = 'Photo captured! Download it or retake your picture.';
  }, 'image/png');
}

function retakePhoto() {
  photo.hidden = true;
  video.hidden = false;
  captureBtn.disabled = false;
  retakeBtn.disabled = true;
  downloadBtn.classList.add('disabled');
  downloadBtn.setAttribute('aria-disabled', 'true');
  statusText.textContent = 'Ready for another shot!';
}

startBtn.addEventListener('click', startCamera);
captureBtn.addEventListener('click', capturePhoto);
retakeBtn.addEventListener('click', retakePhoto);

window.addEventListener('beforeunload', () => {
  if (stream) stream.getTracks().forEach(track => track.stop());
  if (photoUrl) URL.revokeObjectURL(photoUrl);
});
