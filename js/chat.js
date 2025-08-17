
'use strict';

fileInput.onchange = (ev) => {
  const input = ev.target;
  const filename = input.files.length > 0 ? input.files[0].name : "No file";
  fileName.textContent = filename;
}

textInput.oninput = () => {
  textInput.style.height = "auto";
  textInput.style.height = (textInput.scrollHeight) + "px";
}

textInput.onkeydown = (ev) => {
 if (ev.key === 'Enter' && !ev.shiftKey) {
    ev.preventDefault();
    sendBtn.click();
  }
}

sendBtn.onclick = () => {
  sendData();
  textInput.value = "";
  textInput.style.height = "auto";
}


function formatFileSize(bytes) {
  if (bytes >= 1_073_741_824) {
    return (bytes / 1_073_741_824).toFixed(1) + ' GB';
  } else if (bytes >= 1_048_576) {
    return (bytes / 1_048_576).toFixed(1) + ' MB';
  } else if (bytes >= 1024) {
    return (bytes / 1024).toFixed(1) + ' KB';
  } else {
    return bytes + ' Bytes';
  }
}


function linkify(text) {
  return text.replace(/\b((?:https?:\/\/)?(?:www\.)?(?:\d{1,3}(?:\.\d{1,3}){3}|localhost|[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})(?::\d{1,5})?(?:\/\S*)?)/g, url => {
    const href = /^https?:\/\//i.test(url) ? url : 'http://' + url;
    return `<a href="${href}" target="_blank" rel="noopener noreferrer">${url}</a>`;
  }).replace(/\n/g, '<br>');;
}

