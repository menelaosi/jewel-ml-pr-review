// b/snippets/jewel-loader.js

/* Jewel ML loader — clients paste this once, just before </body>. */
(function () {
	var s = document.createElement('script');
	s.src = 'https://cdn.jewelml.io/widgets/latest/jewel.js';
	document.head.appendChild(s);

	s.onload = function () {
		var container = document.getElementById('jml-complete-the-look');
		var sku = window.location.pathname.split('/').pop();
		window.jewelml.mountCompleteTheLook(container, 'victorias-secret', sku);
	};
})();