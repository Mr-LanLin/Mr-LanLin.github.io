var url = document.URL;
//url = decodeURIComponent(url);
var displayframe = document.getElementById('display_frame');
displayframe.src = url.replace('/display.html?static/source', '');