var url = document.URL;
var displayframe = document.getElementById('display_frame');
displayframe.src = url.replace('/display.html?static/source', '');
