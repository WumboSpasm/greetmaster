function prepareSizeButton(greetingContent) {
	const greetingContainer = greetingContent.parentElement;
	const greetingSizeButton = greetingContainer.nextElementSibling.querySelector(".greetmaster-greeting-size-button");
	if (greetingContent.id == "greetmaster-html-container" && localStorage.getItem("greetmaster-greeting-expanded") == "true") {
		greetingSizeButton.textContent = "Shrink Content";
		greetingContainer.classList.add("greetmaster-greeting-max-size");
	}
	else {
		greetingSizeButton.textContent = "Expand Content";
		greetingContainer.classList.add("greetmaster-greeting-min-size");
	}
	greetingSizeButton?.addEventListener("click", () => {
		greetingContainer.classList.toggle("greetmaster-greeting-min-size");
		greetingContainer.classList.toggle("greetmaster-greeting-max-size");
		const expanded = greetingContainer.classList.contains("greetmaster-greeting-max-size");
		greetingSizeButton.textContent = expanded ? "Shrink Content" : "Expand Content";
		localStorage.setItem("greetmaster-greeting-expanded", expanded ? "true" : "false");
	});
}

function uncommentHtml(greetingContent) {
	const greetingHtml = greetingContent.innerHTML.trim().replaceAll("&lt;!--", "<!--").replaceAll("--&gt;", "-->");
	greetingContent.innerHTML = greetingHtml.substring(4, greetingHtml.length - 3);
}

function prepareEditableContent(greetingContent) {
	const editableParams = new URLSearchParams();
	if (greetingContent.id == "greetmaster-html-container") {
		const editableElements = greetingContent.querySelectorAll(".greetmaster-editable-content");
		const mamboMap = {
			"'": "apos",
			",": "comma",
			"!": "exclam",
			".": "period",
			"?": "question",
		};
		const editableToMambo = element => {
			const paramValue = editableParams.get(element.dataset.field).trim();
			const id = params.get("id");
			let mamboContent = "";
			for (let i = 0; i < paramValue.length; i++) {
				let char = paramValue[i].toLowerCase();
				if (paramValue.charCodeAt(i) == 32 || paramValue.charCodeAt(i) == 160)
					mamboContent += `<span class="greetmaster-editable-mambo-spacer"></span>`;
				else if (char == "\n")
					mamboContent += `<span class="greetmaster-editable-mambo-break"></span>`;
				else {
					if (!/[a-z0-9]/.test(char)) {
						if (mamboMap[char] === undefined) continue;
						char = mamboMap[char];
					}
					mamboContent += `<img src="/data/www.imgag.com/product/full/ma/${id}/${char}.gif">`;
				}
			}
			if (id == "2016027" || id == "2016040")
				mamboContent += `<img src="/data/www.imgag.com/product/full/ma/${id}/special.gif">`;
			element.innerHTML = mamboContent;
		}
		const editableFocusEvent = event => {
			if (event.target.dataset.field == "Mambo")
				event.target.innerText = editableParams.get(event.target.dataset.field);
			if (event.target.innerText == event.target.dataset.field)
				event.target.innerText = "\n";
			if (event.target.style.textAlign == "center")
				event.target.style.textAlign = "unset";
			editableInputEvent(event);
		}
		const editableUnfocusEvent = event => {
			if (event.target.innerText == "\n" || event.target.innerText == "") {
				event.target.innerText = event.target.dataset.field;
				event.target.style.textAlign = "center";
			}
			editableInputEvent(event);
			if (event.target.dataset.field == "Mambo")
				editableToMambo(event.target);
		}
		const editablePasteEvent = event => {
			event.preventDefault();
			if (document.activeElement === event.target)
				document.execCommand("insertText", false, event.clipboardData.getData("text"));
		}
		const editableInputEvent = event => {
			for (const editableElement of editableElements) {
				if (editableElement === event.target || editableElement.dataset.field != event.target.dataset.field) continue;
				editableElement.innerHTML = event.target.innerHTML;
				editableElement.style.textAlign = event.target.style.textAlign;
			}
			// innerText is used here instead of textContent only because it preserves newlines
			editableParams.set(event.target.dataset.field, event.target.innerText);
		}
		for (const editableElement of editableElements) {
			if (!editableParams.has(editableElement.dataset.field))
				editableParams.set(editableElement.dataset.field, editableElement.textContent);
			editableElement.addEventListener("focus", editableFocusEvent);
			editableElement.addEventListener("blur", editableUnfocusEvent);
			editableElement.addEventListener("paste", editablePasteEvent);
			editableElement.addEventListener("input", editableInputEvent);
			editableElement.style.minWidth = `${editableElement.offsetWidth}px`;
			editableElement.style.textAlign = "center";
			if (editableElement.dataset.field == "Mambo")
				editableToMambo(editableElement);
		}
	}
	const copyLinkElement = document.querySelector(".greetmaster-greeting-copy-button");
	let linkCopied = false;
	copyLinkElement?.addEventListener("click", async () => {
		if (linkCopied) return;
		let link = `${location.origin}/?id=${params.get("id")}&embed=true`;
		if (editableParams.toString() != "") {
			const encodedParamString = btoa(editableParams.toString());
			if (encodedParamString.length > 2000) {
				alert("You have too much text!");
				return;
			}
			link += `&data=${encodeURIComponent(btoa(editableParams.toString()))}`;
		}
		await navigator.clipboard.writeText(link);
		const copyLinkText = copyLinkElement.textContent;
		copyLinkElement.textContent = "Link copied!";
		copyLinkElement.classList.remove("greetmaster-greeting-options-button");
		copyLinkElement.classList.add("greetmaster-greeting-options-caption");
		linkCopied = true;
		setTimeout(() => {
			copyLinkElement.textContent = copyLinkText;
			copyLinkElement.classList.add("greetmaster-greeting-options-button");
			copyLinkElement.classList.remove("greetmaster-greeting-options-caption");
			linkCopied = false;
		}, 2000);
	});
}

function loadScript(url) {
	const script = document.createElement("script");
	script.src = url;
	document.head.append(script);
	return new Promise(resolve => script.addEventListener("load", resolve));
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
	const screensaver = greetingContent.dataset.type == "Screensaver Preview";
	const player = window.RufflePlayer.newest().createPlayer();
	player.ruffle().config.autoplay = screensaver ? "on" : "off";
	player.ruffle().config.unmuteOverlay = "hidden";
	player.ruffle().config.base = flashInfo.src.replace(/[^/]+$/, "");
	player.ruffle().config.allowScriptAccess = true;
	player.ruffle().config.splashScreen = false;
	player.addEventListener("loadedmetadata", () => {
		if (player.ruffle().metadata.width > 1 && player.ruffle().metadata.height > 1) {
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
		flashUrl += `?ihost=${location.origin}&cardNum=${flashInfo.src.replace(/\.swf$/, "")}`;
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

function revealGreeting(greetingContent, greetingOverlay) {
	greetingContent.classList.remove("greetmaster-greeting-hidden");
	greetingOverlay.style.display = "none";
}

document.addEventListener("DOMContentLoaded", async () => {
	const greetingOverlay = document.querySelector(".greetmaster-greeting-overlay");
	const greetingContent = greetingOverlay.previousElementSibling;
	if (greetingContent.id == "greetmaster-html-container") {
		prepareSizeButton(greetingContent);
		uncommentHtml(greetingContent);
	}
	else
		greetingContent.parentElement.classList.add("greetmaster-greeting-min-size");
	prepareEditableContent(greetingContent);
	await prepareMidi(greetingContent, greetingOverlay);
	await prepareFlash(greetingContent, greetingOverlay);
	await prepareEmu(greetingContent, greetingOverlay);
	if (["Image E-Card", "Wallpaper Preview", "Screensaver Preview"].some(type => type == greetingContent.dataset.type))
		revealGreeting(greetingContent, greetingOverlay);
	else {
		greetingOverlay.classList.remove("greetmaster-hidden");
		greetingOverlay.addEventListener("click", () => { revealGreeting(greetingContent, greetingOverlay); });
	}
});