var url = document.URL.replace('/display.html?static/source', '');
url = "https://mr-lanlin.github.io/2017/12/13/Java注解知识整理.html";
//url = decodeURIComponent(url);
var minHeight = $(window).height() - 200 + "px";
$("#container").html('<iframe id="display_frame" frameborder="0" onload="newsize();" src="' + url + '" style="overflow-x: auto !important;min-height: ' + minHeight + '" width="100%" height="100%">\n' +
    '    </iframe>');
function newsize() {
    var displayframe = document.getElementById('display_frame');
    var docm = displayframe.contentDocument;
    displayframe.style.height = docm.getElementsByTagName("body")[0].offsetHeight + 100 + "px";
}