const thumbWidth = 100;
const thumbHeight = 54;

const thumbScrollBuffer = 20;
const thumbLoadBuffer = 40;

let thumbContainer;
let thumbFragment;

let pageFullyLoaded = false;
let loadingThumbs = false;
let thumbsLoaded = 0;

const defaultSrc = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';

const getThumbColumns = () => Math.floor(thumbContainer.scrollWidth / thumbWidth);
const getThumbRows = () => Math.ceil(thumbContainer.scrollHeight / thumbHeight);
const getVisibleThumbRows = () => Math.ceil(thumbContainer.offsetHeight / thumbHeight);

const thumbObserver = new IntersectionObserver((entries, observer) => {
	for (const entry of entries) {
		const thumb = entry.target;
		if (thumb.src == defaultSrc && entry.isIntersecting) {
			thumb.src = thumb.dataset.src;
			observer.unobserve(thumb);
		}
	}
});

function loadThumbs(thumbRemainder) {
	loadingThumbs = true;
	const thumbAmount = (getVisibleThumbRows() + thumbLoadBuffer) * getThumbColumns() + thumbRemainder;
	let getUrl = `/get?count=${thumbAmount}&offset=${thumbsLoaded}&field=titles&field=thumbnailPath`;
	if (filterParamsString != '') getUrl += `&${filterParamsString}`;
	fetch(getUrl).then(response => response.json()).then(greetings => {
		const realThumbAmount = Object.keys(greetings).length;
		if (realThumbAmount == 0) pageFullyLoaded = true;
		for (const id in greetings) {
			const link = document.createElement('a');
			link.id = 'greetmaster-thumbnail';
			link.setAttribute('href', `/?id=${id}`);
			const thumb = document.createElement('img');
			thumb.dataset.src = greetings[id].thumbnailPath != '' ? `/data/thumbs/${Math.floor(id / 1000)}/${id}.webp` : '/data/thumbs/nothumb.webp';
			thumb.src = defaultSrc;
			thumb.setAttribute('width', thumbWidth);
			thumb.setAttribute('height', thumbHeight);
			thumb.setAttribute('title', greetings[id].titles.length > 0 ? greetings[id].titles[0].replace(/<br>/i, '\n') : '');
			thumb.setAttribute('loading', 'lazy');
			thumbObserver.observe(thumb);
			link.append(thumb);
			thumbFragment.append(link);
		}
		thumbContainer.append(thumbFragment);
		thumbsLoaded += realThumbAmount;
		loadingThumbs = false;
	});
}

function prepareLoadThumbs() {
	if (loadingThumbs || pageFullyLoaded) return;
	const thumbRows = getThumbRows();
	if (thumbContainer.scrollTop + thumbContainer.offsetHeight > (thumbRows - thumbScrollBuffer) * thumbHeight)
		loadThumbs((thumbRows * getThumbColumns()) - thumbsLoaded);
}

document.addEventListener('DOMContentLoaded', () => {
	thumbContainer = document.querySelector('.greetmaster-content');
	thumbContainer.addEventListener('scroll', prepareLoadThumbs);
	new ResizeObserver(prepareLoadThumbs).observe(thumbContainer);
	thumbFragment = document.createDocumentFragment();
	loadThumbs(0);
});