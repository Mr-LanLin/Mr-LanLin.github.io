var url = document.URL.replace('/display.html?static/source', '');
//url = decodeURIComponent(url);
document.getElementById("SOHUCS").sid=url;
var minHeight = $(window).height() - 200 + "px";
$("#container").html('<iframe id="display_frame" sandbox="allow-scripts" scrolling="no" sandbox="allow-same-origin" frameborder="0" onload="newsize();" src="' + url + '" style="overflow-x: auto !important;min-height: ' + minHeight + '" width="100%" height="100%">\n' +
    '    </iframe>');
function newsize() {
    var displayframe = document.getElementById('display_frame');
    var docm = displayframe.contentDocument;
    displayframe.style.height = docm.getElementsByTagName("body")[0].offsetHeight + 100 + "px";
    w = c.width = window.innerWidth - 30;
    h = c.height = document.getElementsByTagName("body")[0].offsetHeight - 920;
    displayframe.scrolling = "auto";
}
function next(url){
	top.location.href(url);
}
