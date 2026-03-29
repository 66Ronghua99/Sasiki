const status = document.getElementById("status");
const captureButton = document.getElementById("capture");

function setStatus(message) {
  status.textContent = message;
}

captureButton.addEventListener("click", async () => {
  setStatus("Capturing...");

  const response = await chrome.runtime.sendMessage({
    type: "sasiki.capture.active",
  });

  if (!response?.ok) {
    setStatus(`Capture failed: ${response?.error ?? "unknown error"}`);
    return;
  }

  setStatus(`Captured ${response.result.site}`);
});
