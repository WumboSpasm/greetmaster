const thumbWidth = 100;
const thumbHeight = 54;

const thumbDisplayBuffer = 2;
const thumbScrollBuffer = 20;
const thumbLoadBuffer = 40;

let thumbContainer;
let thumbFragment;

let pageFullyLoaded = false;
let loadingThumbs = false;
let thumbsLoaded = 0;

let displayThumbsTimer;
let scrollTimer = null;
let lastScrollPos = 0;

const defaultSrc = "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";

const getThumbColumns = () => Math.floor(thumbContainer.scrollWidth / thumbWidth);
const getThumbRows = () => Math.ceil(thumbContainer.scrollHeight / thumbHeight);
const getVisibleThumbRows = () => Math.ceil(thumbContainer.offsetHeight / thumbHeight);

function loadThumbs(thumbRemainder, doDisplayThumbs) {
	loadingThumbs = true;
	const thumbAmount = (getVisibleThumbRows() + thumbLoadBuffer) * getThumbColumns() + thumbRemainder;
	let getUrl = `/get?count=${thumbAmount}&offset=${thumbsLoaded}&field=titles&field=thumbnail`;
	if (filterParamsString != "") getUrl += `&${filterParamsString}`;
	fetch(getUrl).then(response => response.json()).then(greetings => {
		const realThumbAmount = Object.keys(greetings).length;
		if (realThumbAmount == 0) pageFullyLoaded = true;
		for (const id in greetings) {
			const link = document.createElement("a");
			link.id = "greetmaster-thumbnail";
			link.setAttribute("href", `/?id=${id}`);
			const thumb = document.createElement("img");
			thumb.dataset.src = greetings[id].thumbnail != "" ? `/data/thumbs/${Math.floor(id / 1000)}/${id}.webp` : "/data/thumbs/nothumb.webp";
			thumb.src = defaultSrc;
			thumb.setAttribute("width", thumbWidth);
			thumb.setAttribute("height", thumbHeight);
			thumb.setAttribute("title", greetings[id].titles.length > 0 ? greetings[id].titles[0].replace(/<br>/i, "\n") : "");
			thumb.setAttribute("loading", "lazy");
			link.append(thumb);
			thumbFragment.append(link);
		}
		thumbContainer.append(thumbFragment);
		thumbsLoaded += realThumbAmount;
		loadingThumbs = false;
		if (doDisplayThumbs) displayThumbs();
	});
}

function prepareLoadThumbs() {
	prepareDisplayThumbs();
	if (loadingThumbs || pageFullyLoaded) return;
	const thumbRows = getThumbRows();
	if (thumbContainer.scrollTop + thumbContainer.offsetHeight > (thumbRows - thumbScrollBuffer) * thumbHeight)
		loadThumbs((thumbRows * getThumbColumns()) - thumbsLoaded, false);
}

function displayThumbs() {
	const thumbColumns = getThumbColumns();
	const thumbStart = thumbColumns * Math.max(0, Math.floor(thumbContainer.scrollTop / thumbHeight) - thumbDisplayBuffer);
	const thumbEnd = thumbColumns * Math.ceil((thumbContainer.scrollTop + thumbContainer.offsetHeight) / thumbHeight + thumbDisplayBuffer);
	const thumbList = thumbContainer.children;
	for (let i = thumbStart; i < thumbEnd; i++) {
		const thumb = thumbList.item(i)?.children.item(0);
		if (!thumb || thumb.src != defaultSrc || thumb.dataset.src == "/data/") continue;
		thumb.src = thumb.dataset.src;
	}
}

function prepareDisplayThumbs() {
	if (scrollTimer !== null) return;
	scrollTimer = setTimeout(() => {
		const scrollVelocity = Math.abs(thumbContainer.scrollTop - lastScrollPos);
		if (scrollVelocity > 250) {
			clearTimeout(displayThumbsTimer);
			displayThumbsTimer = setTimeout(displayThumbs, 300);
		}
		else
			displayThumbs();
		lastScrollPos = thumbContainer.scrollTop;
		scrollTimer = null;
	}, 200);
}

document.addEventListener("DOMContentLoaded", () => {
	thumbContainer = document.querySelector(".greetmaster-content");
	thumbContainer.addEventListener("scroll", prepareLoadThumbs);
	new ResizeObserver(prepareLoadThumbs).observe(thumbContainer);
	thumbFragment = document.createDocumentFragment();
	loadThumbs(0, true);
});