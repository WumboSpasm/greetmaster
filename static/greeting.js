function prepareHtml(greetingContent, greetingOverlay) {
	const greetingContainer = greetingContent.parentElement;
	const greetingSizeButton = greetingContainer.querySelector(".greetmaster-greeting-size-button");
	if (greetingContent.id == "greetmaster-html-container" && localStorage.getItem("greetmaster-greeting-expanded") == "true") {
		greetingSizeButton.textContent = "Shrink Content";
		greetingContainer.classList.add("greetmaster-greeting-max-size");
	}
	else {
		greetingSizeButton.textContent = "Expand Content";
		greetingContainer.classList.add("greetmaster-greeting-min-size");
	}
	if (greetingContent.id != "greetmaster-html-container") return;
	uncommentHtml(greetingContent);
	const greetingFooter = greetingContainer.querySelector(".greetmaster-greeting-footer");
	greetingOverlay.addEventListener("click", () => {
		greetingSizeButton.addEventListener("click", () => {
			greetingContainer.classList.toggle("greetmaster-greeting-min-size");
			greetingContainer.classList.toggle("greetmaster-greeting-max-size");
			const expanded = greetingContainer.classList.contains("greetmaster-greeting-max-size");
			greetingSizeButton.textContent = expanded ? "Shrink Content" : "Expand Content";
			localStorage.setItem("greetmaster-greeting-expanded", expanded ? "true" : "false");
		});
		greetingFooter.classList.remove("greetmaster-hidden");
	});
}

async function prepareMidi(greetingContent, greetingOverlay) {
	if (!window.isSecureContext) return;
	const midiPlaceholder = greetingContent.querySelector("#greetmaster-midi-placeholder");
	if (midiPlaceholder === null) return;
	const spessasynth = await import("./midi/spessasynth_lib.min.js");
	const soundfont = await (await fetch("./midi/gm.dls")).arrayBuffer();
	const midi = await (await fetch(midiPlaceholder.dataset.src)).arrayBuffer();
	const audioContext = new AudioContext();
	await audioContext.audioWorklet.addModule("./midi/worklet_processor.min.js");
	greetingOverlay.addEventListener("click", () => {
		const synthesizer = new spessasynth.Synthetizer(audioContext.destination, soundfont);
		synthesizer.setMainVolume(2);
		synthesizer.setEffectsGain(0, 0);
		const sequencer = new spessasynth.Sequencer([{ binary: midi }], synthesizer, { autoPlay: false });
		const midiLoop = parseInt(midiPlaceholder.dataset.loop);
		sequencer.loop = midiLoop != 0;
		sequencer.loopsRemaining = midiLoop;
		sequencer.play();
	});
	midiPlaceholder.remove();
}

async function prepareFlash(greetingContent, greetingOverlay) {
	const flashPlaceholder = greetingContent.querySelector("#greetmaster-flash-placeholder");
	if (flashPlaceholder === null) return;
	const flashInfo = flashPlaceholder.dataset;
	await loadScript("https://unpkg.com/@ruffle-rs/ruffle");
	const player = window.RufflePlayer.newest().createPlayer();
	player.ruffle().config.autoplay = "off";
	player.ruffle().config.base = flashInfo.src.replace(/[^/]+$/, "");
	player.ruffle().config.allowScriptAccess = true;
	player.ruffle().config.splashScreen = false;
	player.addEventListener("loadedmetadata", () => {
		if (player.ruffle().metadata.width > 1 && player.ruffle().metadata.height > 1) {
			const screensaver = greetingContent.dataset.type == "Screensaver Preview";
			player.style.width  = `${!screensaver ? player.ruffle().metadata.width : 224}px`;
			player.style.height = `${!screensaver ? player.ruffle().metadata.height : 168}px`;
		}
	});
	let flashUrl = flashInfo.src;
	if (flashInfo.protected == "true") {
		if (flashInfo.height <= 300)
			flashUrl = "/data/www.imgag.com/product/preview/flash/fsShell.swf";
		else if (flashInfo.height <= 320)
			flashUrl = "/data/www.imgag.com/product/preview/flash/ws8Shell.swf";
		else
			flashUrl = "/data/www.imgag.com/product/preview/flash/bws8Shell.swf";
		flashUrl += `?ihost=${location.origin}&cardNum=${flashInfo.src.replace(/\.sw[ft]$/, "")}`;
	}
	flashPlaceholder.replaceWith(player);
	await player.ruffle().load(flashUrl);
	greetingOverlay.addEventListener("click", () => player.ruffle().resume());
}

async function prepareEmu(greetingContent, greetingOverlay) {
	if (greetingContent.id != "greetmaster-emu-container") return;
	await Promise.all([
		loadScript("/emu/js-dos.js"),
		loadScript("/emu/zip-fs-full.min.js"),
	]);
	const emuPlaceholder = greetingContent.querySelector("#greetmaster-emu-placeholder");
	const shockwave = greetingContent.dataset.type == "Shockwave E-Card";
	const [systemFiles, greetingFile, projectorFile] = await Promise.all([
		fetch("/emu/win31.zip"),
		fetch(emuPlaceholder.dataset.src),
		shockwave ? fetch("/emu/projector.exe") : Promise.resolve()
	]);
	const zipData = new zip.fs.FS();
	await zipData.importBlob(await systemFiles.blob());
	if (shockwave) {
		await zipData.addBlob("files/app.exe", await projectorFile.blob());
		await zipData.addBlob("files/movie.dcr", await greetingFile.blob());
	}
	else
		await zipData.addBlob("files/app.exe", await greetingFile.blob());
	const zipUrl = URL.createObjectURL(await zipData.exportBlob());
	greetingOverlay.addEventListener("click", () => {
		Dos(emuPlaceholder, {
			url: zipUrl,
			pathPrefix: "/emu/",
			kiosk: true,
			noCloud: true,
			autoStart: true,
		});
	});
}

function loadScript(url) {
	const script = document.createElement("script");
	script.src = url;
	document.head.append(script);
	return new Promise(resolve => script.addEventListener("load", resolve));
}

function uncommentHtml(greetingContent) {
	const greetingHtml = greetingContent.innerHTML.trim().replaceAll("&lt;!--", "<!--").replaceAll("--&gt;", "-->");
	greetingContent.innerHTML = greetingHtml.substring(4, greetingHtml.length - 3);
}

document.addEventListener("DOMContentLoaded", async () => {
	const greetingOverlay = document.querySelector(".greetmaster-greeting-overlay");
	const greetingContent = greetingOverlay.previousElementSibling;
	if (greetingContent.id != "greetmaster-unsupported-container") {
		if (params.get("embed") != "true")
			prepareHtml(greetingContent, greetingOverlay);
		else if (greetingContent.id == "greetmaster-html-container")
			uncommentHtml(greetingContent);
		await prepareMidi(greetingContent, greetingOverlay);
		await prepareFlash(greetingContent, greetingOverlay);
		await prepareEmu(greetingContent, greetingOverlay);
		greetingOverlay.classList.remove("greetmaster-hidden");
		greetingOverlay.addEventListener("click", () => {
			greetingContent.classList.remove("greetmaster-greeting-hidden");
			greetingOverlay.style.display = "none";
		});
	}
	else {
		greetingContent.classList.remove("greetmaster-greeting-hidden");
		greetingOverlay.style.display = "none";
	}
});