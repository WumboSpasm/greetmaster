import { contentType } from "jsr:@std/media-types";
import { parseArgs } from "jsr:@std/cli/parse-args";
import { stringifyEntities } from "https://esm.sh/stringify-entities@4.0.4";

// Define default config
const config = {
	httpPort: 8991,
	httpsPort: 8992,
	httpsCert: null,
	httpsKey: null,
	accessHosts: [],
	blockedIPs: [],
	blockedUAs: [],
	greetingIndex: "greetings.json",
	logFile: "server.log",
	logToConsole: true,
	logBlockedRequests: true,
};

// Define templates
const templates = {
	main:			getTemplate("main.html"),
	navigation:		getTemplate("navigation.html"),
	greeting:		getTemplate("greeting.html"),
	about:			getTemplate("about.html"),
	error:			getTemplate("error.html"),
};

// Define command-line flags and their default values
const flags = parseArgs(Deno.args, {
	string: ["config"],
	default: { "config": "config.json" },
});

// Attempt to load config file
if (getPathInfo(flags["config"])?.isFile) {
	Object.assign(config, JSON.parse(Deno.readTextFileSync(flags["config"])));
	logMessage(`loaded config file: ${Deno.realPathSync(flags["config"])}`);
}

const greetings = JSON.parse(Deno.readTextFileSync(config.greetingIndex));
logMessage(`loaded greeting index: ${Deno.realPathSync(config.greetingIndex)}`);

const fields = ["titles", "categories", "sources", "types", "htmlPath", "contentPath", "thumbnailPath"];

const filters = {
	"search": (greeting, value) => greeting.titles.concat(greeting.categories).some(entry => entry.toLowerCase().replace("<br>", " ").includes(value.toLowerCase())),
	"title": (greeting, value) => greeting.titles.includes(value),
	"category": (greeting, value) => greeting.categories.includes(value),
	"source": (greeting, value) => greeting.sources.includes(value),
	"type": (greeting, value) => greeting.types.includes(value),
};

const mamboMap = {
	"'": "apos",
	",": "comma",
	"!": "exclam",
	".": "period",
	"?": "question",
};

const globalStats = getStats(new URLSearchParams(), true);
const statTitles = Object.values(greetings).reduce((statTitles, greeting) => {
	for (const title of greeting.titles)
		statTitles[title] = (statTitles[title] ?? 0) + 1;
	return statTitles;
}, {});

const urlExps = [/((?:href|src|action|background) *= *)("(?:(?!>).)+?"|[^ >]+)/gis, /(url *)(\(.+?\))/gis];
const editableExp = /\[([a-z0-9 ]+)\]/gi;

// Handle server requests
const serverHandler = (request, info) => {
	const ipAddress = info.remoteAddr.hostname;
	const userAgent = request.headers.get("User-Agent") ?? "";

	// Check if IP or user agent is in blocklist
	const blockRequest =
		config.blockedIPs.some(blockedIP => ipAddress.startsWith(blockedIP)) ||
		config.blockedUAs.some(blockedUA => userAgent.includes(blockedUA));

	// Log the request if desired
	if (!blockRequest || config.logBlockedRequests)
		logMessage(`${blockRequest ? "BLOCKED " : ""}${ipAddress} (${userAgent}): ${request.url}`);

	// If request needs to be blocked, return a Not Found error
	if (blockRequest) throw new NotFoundError();

	// Make sure request is for a valid URL
	const requestUrl = URL.parse(request.url);
	if (requestUrl === null) throw new BadRequestError();

	// If access host is configured, do not allow connections through any other hostname
	if (config.accessHosts.length > 0 && !config.accessHosts.some(host => host == requestUrl.hostname))
		throw new BadRequestError();

	// Get body of request URL
	let requestPath = requestUrl.pathname.replace(/^[/]+/, "");

	// Get values of query string
	const params = requestUrl.searchParams;

	switch (requestPath) {
		case "":
		case "about": {
			const mainVars = {
				"TITLE": "Greetmaster",
				"OGTITLE": "Greetmaster",
				"OGIMAGE": `${requestUrl.origin}/logo.png`,
				"OGURL": request.url,
				"NOINDEX": true,
				"SHOWNAV": true,
				"PAGECSS": "home.css",
				"PAGESCRIPT": "home.js",
				"STYLE": "",
				"CONTENT": "",
			};
			const isEmbedded = params.get("embed") == "true";
			if (requestPath == "about") {
				mainVars["TITLE"] = "About Greetmaster";
				mainVars["OGTITLE"] = mainVars["TITLE"];
				mainVars["PAGECSS"] = "about.css";
				mainVars["PAGESCRIPT"] = false;
				mainVars["CONTENT"] = templates.about;
			}
			else if (params.has("id")) {
				const id = params.get("id");
				const greeting = greetings[id];
				if (greeting === undefined) throw new BadRequestError();
				if (isEmbedded) {
					mainVars["TITLE"] = "E-Card at Greetmaster";
					mainVars["SHOWNAV"] = false;
				}
				else {
					mainVars["TITLE"] = `${greeting.types[0]} at Greetmaster`;
					if (greeting.titles.length > 0)
						mainVars["TITLE"] = `${greeting.titles[0].replace(/<br>/i, " ")} - ${mainVars["TITLE"]}`;
					if (greeting.thumbnailPath != "")
						mainVars["OGIMAGE"] = `${requestUrl.origin}/data/thumbs/${id.substring(0, 4)}/${id}.png`;
					mainVars["NOINDEX"] = false;
				}
				mainVars["PAGECSS"] = "greeting.css";
				mainVars["PAGESCRIPT"] = "greeting.js";
				const greetingVars = {
					"STYLE": "",
					"TYPE": greeting.types[0],
					"BODY":  "",
					"SIZEBUTTON": false,
					"LINKS": false,
					"COPYBUTTON": !isEmbedded,
					"HOMEBUTTON": isEmbedded,
				};
				if (greeting.htmlPath != "") {
					greetingVars["STYLE"] = "greetmaster-html-container";
					[greetingVars["BODY"], mainVars["STYLE"]] = preparePage(greeting, params);
					greetingVars["BODY"] = `<!--${greetingVars["BODY"].replaceAll("<!--", "&lt;!--").replaceAll("-->", "--&gt;")}-->`;
					greetingVars["SIZEBUTTON"] = true;
					const isEditable = greetingVars["BODY"].includes("greetmaster-editable-content");
					if (greetingVars["COPYBUTTON"] && isEditable)
						greetingVars["COPYBUTTON"] = " Personalized";
					if (isEmbedded && isEditable)
						mainVars["TITLE"] = `Personalized ${mainVars["TITLE"]}`;
				}
				else {
					switch (greeting.types[0]) {
						case "Flash E-Card": {
							greetingVars["STYLE"] = "greetmaster-flash-container";
							greetingVars["BODY"] = "strFlashHTML";
							break;
						}
						case "Image E-Card": {
							greetingVars["STYLE"] = "greetmaster-image-container";
							greetingVars["BODY"] = `<img src="/data/${greeting.contentPath}">`;
							break;
						}
						case "Downloadable E-Card":
						case "Shockwave E-Card": {
							greetingVars["STYLE"] = "greetmaster-emu-container";
							greetingVars["BODY"] = `<div id="greetmaster-emu-placeholder" data-src="/data/${greeting.contentPath}"></div>`;
							break;
						}
						default: {
							throw new BadRequestError();
						}
					}
				}
				if (greeting.contentPath != "" && greetingVars["BODY"].includes("strFlashHTML")) {
					const flashAttrString = [
						`data-src="/data/${greeting.contentPath}"`,
						`data-width="${greeting.extraVars.width}"`,
						`data-height="${greeting.extraVars.height}"`,
						`data-protected="${greeting.extraVars.protected}"`,
					].join(" ");
					greetingVars["BODY"] = greetingVars["BODY"].replace("strFlashHTML", `<div id="greetmaster-flash-placeholder" ${flashAttrString}></div>`);
				}
				if (greeting.types[0] == "Wallpaper Preview")
					greetingVars["LINKS"] = buildDownloads({
						"640x480": greeting.extraVars.smallPath,
						"800x600": greeting.extraVars.mediumPath,
						"1024x768": greeting.extraVars.largePath,
						"1280x1024": greeting.extraVars.extraLargePath,
					});
				else if (greeting.types[0] == "Screensaver Preview")
					greetingVars["LINKS"] = buildDownloads({
						"Windows": greeting.extraVars.windowsPath,
						"MacOS": greeting.extraVars.macPath,
					});
				if (greetingVars["HOMEBUTTON"])
					greetingVars["HOMEBUTTON"] = requestUrl.origin;
				mainVars["OGTITLE"] = stringifyEntities(mainVars["TITLE"], { escapeOnly: true });
				mainVars["CONTENT"] = buildHtml(templates.greeting, greetingVars);
			}
			if (params.toString() == "")
				mainVars["NOINDEX"] = false;
			if (!isEmbedded || mainVars["PAGESCRIPT"] != "greeting.js")
				mainVars["CONTENT"] = buildHtml(templates.navigation, {
					"SEARCH": mainVars["PAGESCRIPT"] == "home.js"
						? stringifyEntities((params.get("search") ?? "").substring(0, 64), { escapeOnly: true })
						: "",
					"CONTENT": mainVars["CONTENT"],
				});
			return new Response(buildHtml(templates.main, mainVars), { headers: { "Content-Type": "text/html; charset=UTF-8" } });
		}
		case "get": {
			const greetingList = {};
			let requestFields = params.getAll("field").filter(field => fields.some(validField => field == validField));
			if (requestFields.length == 0) requestFields = fields;
			if (params.has("id")) {
				const id = params.get("id");
				const greeting = greetings[id];
				if (greeting !== undefined) {
					greetingList[id] = {};
					for (const field of requestFields)
						greetingList[id][field] = greeting[field];
				}
			}
			else {
				const count = parseInt(params.get("count")) || 0;
				const offset = parseInt(params.get("offset")) || 0;
				if (count > 0) {
					const requestFilters = getRequestFilters(params);
					let added = 0;
					let skipped = 0;
					for (const id in greetings) {
						const greeting = greetings[id];
						if (greeting === undefined || requestFilters.some(([key, value]) => !filters[key](greeting, value)))
							continue;
						if (added >= count) break;
						if (skipped < offset)
							skipped++;
						else {
							greetingList[id] = {};
							for (const field of requestFields)
								greetingList[id][field] = greeting[field];
							added++;
						}
					}
				}
			}
			return new Response(JSON.stringify(greetingList), { headers: { "Content-Type": "application/json; charset=UTF-8" } });
		}
		case "stats": {
			const statsList = params.toString() == "" ? globalStats : getStats(params);
			return new Response(JSON.stringify(statsList), { headers: { "Content-Type": "application/json; charset=UTF-8" } });
		}
		case "random": {
			const randomList = [];
			const requestFilters = getRequestFilters(params);
			for (const id in greetings) {
				const greeting = greetings[id];
				if (greeting !== undefined && requestFilters.every(([key, value]) => filters[key](greeting, value)))
					randomList.push(id);
			}
			const randomId = randomList[Math.floor(Math.random() * randomList.length)];
			return Response.redirect(`${requestUrl.origin}/?id=${randomId}`);
		}
		default: {
			if (!requestPath.startsWith("data/")) requestPath = `static/${requestPath}`;
			if (!getPathInfo(requestPath)?.isFile) throw new NotFoundError();
			const responseType = contentType(requestPath.substring(requestPath.lastIndexOf("."))) ?? "application/octet-stream";
			return new Response(Deno.openSync(requestPath).readable, { headers: { "Content-Type": responseType }});
		}
	}
};

// Display error page
const serverError = (error) => {
	const [badRequest, notFound] = [error instanceof BadRequestError, error instanceof NotFoundError];
	let errorPage = templates.error;
	if (badRequest || notFound)
		errorPage = buildHtml(errorPage, {
			"STATUSTEXT": `${error.status} ${error.statusText}`,
			"MESSAGE": badRequest ? "The requested URL is invalid." : "The requested URL does not exist."
		});
	else {
		logMessage(error.stack);
		errorPage = buildHtml(errorPage, {
			"STATUSTEXT": "500 Internal Server Error",
			"MESSAGE": "The server encountered an error while handling the request.",
		});
	}
	return new Response(errorPage, { status: error.status ?? 500, headers: { "Content-Type": "text/html; charset=UTF-8" } });
};

// Start server on HTTP and/or HTTPS
if (config.httpPort)
	Deno.serve({
		port: config.httpPort,
		hostname: config.hostName,
		onError: serverError,
	}, serverHandler);
if (config.httpsPort && config.httpsCert && config.httpsKey)
	Deno.serve({
		port: config.httpsPort,
		cert: Deno.readTextFileSync(config.httpsCert),
		key: Deno.readTextFileSync(config.httpsKey),
		hostName: config.hostName,
		onError: serverError,
	}, serverHandler);

// Get page content as UTF-encoded string
function getPage(greeting) {
	const pagePath = greeting.htmlPath;
	const pageEncoding = greeting.extraVars.encoding;
	const page = pageEncoding == "ASCII" || pageEncoding == "UTF-8"
		? Deno.readTextFileSync(`data/${pagePath}`)
		: new TextDecoder().decode(new Deno.Command("iconv", { args: [`data/${pagePath}`, "-cf", pageEncoding, "-t", "UTF-8"], stdout: "piped" }).outputSync().stdout);
	return page.replaceAll(/[\r\n]+/g, "\n");
}

// Rewrite in-page links to stay within site
function redirectLinks(page, pagePath) {
	const urlData = [];
	for (let i = 0; i < urlExps.length; i++) {
		const urlExp = urlExps[i];
		for (let match; (match = urlExp.exec(page)) !== null;) {
			let url = trimString(match[2]);
			if (["#", "/", "http://", "https://"].some(prefix => url.startsWith(prefix))) continue;
			url = `/${new URL(url, `https://${pagePath}`).href.replace(/^https:\/\//, "data/")}`;
			url = i == 0 ? `"${url}"` : `(${url})`;
			urlData.push({
				attribute: match[1],
				url: url,
				start: match.index,
				end: match.index + match[0].length,
			});
		}
	}
	let offset = 0;
	let newPage = "";
	for (const entry of urlData.toSorted((a, b) => a.start - b.start)) {
		newPage += page.substring(0, entry.start - offset) + entry.attribute + entry.url;
		page = page.substring(entry.end - offset);
		offset = entry.end;
	}
	return newPage + page;
}

// Return page data that is prepared to be injected into greeting template
function preparePage(greeting, params) {
	const attrExp = /([a-z]+) *= *("(?:(?!>).)+?"|[^ >]+)/gis;
	let bodyContent = redirectLinks(getPage(greeting), greeting.htmlPath);
	let styleElement = "";
	const body = bodyContent.match(/(<body.*?>)\s*(.*?)\s*<\/body>/is);
	if (body !== null) {
		const bodyStyles = [];
		const linkStyles = [];
		for (let match; (match = attrExp.exec(body[1])) !== null;) {
			let [field, value] = [match[1].toLowerCase(), trimString(match[2])];
			if (value == "") continue;
			if (["bgcolor", "text", "link", "alink", "vlink"].some(colorField => field == colorField) && !value.startsWith("#"))
				value = `#${value}`;
			else if (["topmargin", "bottommargin", "leftmargin", "rightmargin"].some(marginField => field == marginField))
				value = `${value}px`;
			switch (field) {
				case "background":
					bodyStyles.push(`background-image: url(${value})`);
					break;
				case "bgcolor":
					bodyStyles.push(`background-color: ${value}`);
					break;
				case "text":
					bodyStyles.push(`color: ${value}`);
					break;
				case "link":
					linkStyles.push(`#greetmaster-html-container a:link { color: ${value}; }`);
					break;
				case "alink":
					linkStyles.push(`#greetmaster-html-container a:active { color: ${value}; }`);
					break;
				case "vlink":
					linkStyles.push(`#greetmaster-html-container a:visited { color: ${value}; }`);
					break;
				case "topmargin":
					bodyStyles.push(`margin-top: ${value}`);
					break;
				case "bottommargin":
					bodyStyles.push(`margin-bottom: ${value}`);
					break;
				case "leftmargin":
					bodyStyles.push(`margin-left: ${value}`);
					break;
				case "rightmargin":
					bodyStyles.push(`margin-right: ${value}`);
					break;
				case "style":
					bodyStyles.push(value.replace(/;$/, ""));
			}
		}
		const styles = [];
		if (bodyStyles.length > 0) styles.push(`#greetmaster-html-container { ${bodyStyles.join("; ")}; }`);
		if (linkStyles.length > 0) styles.push(...linkStyles);
		if (styles.length > 0) styleElement = `<style>\n${styles.map(style => `\t${style}`).join("\n")}\n</style>`;
		bodyContent = body[2];
	}
	const embedExp = /\s*(<(?:embed|bgsound|noembed>\s*<bgsound)[^>]+>)(?:\s*<\/(?:no)?embed>)?/gi;
	const embedRanges = [];
	const midiAttrs = { src: "", loop: "-1" };
	let acquiredAttrs = false;
	for (let embedMatch; (embedMatch = embedExp.exec(bodyContent)) !== null;) {
		const embedTag = embedMatch[1];
		if (!acquiredAttrs) {
			for (let attrMatch; (attrMatch = attrExp.exec(embedTag)) !== null;) {
				const [field, value] = [attrMatch[1].toLowerCase(), trimString(attrMatch[2])];
				if ((field == "src" || field == "bgsound") && value.toLowerCase().endsWith(".mid"))
					midiAttrs.src = value;
				else if (field == "loop") {
					const valueLower = value.toLowerCase();
					if (valueLower == "false" || valueLower == "no")
						midiAttrs.loop = "0";
					else if (!isNaN(valueLower))
						midiAttrs.loop = valueLower;
				}
			}
		}
		if (midiAttrs.src != "") acquiredAttrs = true;
		embedRanges.push([embedMatch.index, embedMatch.index + embedMatch[0].length]);
	}
	if (acquiredAttrs && embedRanges.length > 0) {
		let offset = 0;
		let newBodyContent = "";
		for (const [start, end] of embedRanges) {
			newBodyContent += bodyContent.substring(0, start - offset);
			bodyContent = bodyContent.substring(end - offset);
			offset = end;
		}
		const midiAttrString = Object.entries(midiAttrs).map(attr => `data-${attr[0]}="${attr[1]}"`).join(" ");
		bodyContent = `<div id="greetmaster-midi-placeholder" ${midiAttrString}></div>\n` + newBodyContent + bodyContent;
	}
	if (greeting.types[0] == "CreataMail Template")
		bodyContent = bodyContent.replaceAll(/ contenteditable="(?:true|false)"/g, "");
	else if (greeting.types[0] == "Animated Text E-Card")
		bodyContent = bodyContent.replace(/\[Mamboline1\]\s*\[Mamboline2\]\s*\[Mamboline3\]/, "[Mambo]<br>");
	if (params.get("embed") == "true") {
		let decodedParamsString;
		try { decodedParamsString = atob(params.get("data").substring(0, 2000)); } catch {}
		const decodedParams = new URLSearchParams(decodedParamsString);
		bodyContent = bodyContent.replaceAll(editableExp, (_, bodyParam) => {
			let paramValue = (decodedParams.get(bodyParam) ?? bodyParam).trim();
			if (bodyParam == "Mambo") {
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
				paramValue = mamboContent;
			}
			else
				paramValue = stringifyEntities(paramValue, { escapeOnly: true }).replaceAll("\n", "<br>");
			return paramValue;
		});
	}
	else
		bodyContent = bodyContent.replaceAll(editableExp, `<span class="greetmaster-editable-content" contenteditable="true" data-field="$1">$1</span>`);
	return [bodyContent, styleElement];
}

// Gather statistics for e-card properties
function getStats(params) {
	const statsList = {
		titles: {},
		categories: {},
		sources: {},
		types: {},
	};
	const incrementStat = (field, value) => statsList[field][value] = (statsList[field][value] ?? 0) + 1;
	if (params.has("id")) {
		const compareGreeting = greetings[parseInt(params.get("id"))];
		if (compareGreeting !== undefined) {
			for (const field in statsList) {
				for (const value of compareGreeting[field])
					statsList[field][value] = field == "titles" ? statTitles[value] : globalStats[field][value];
			}
		}
		statsList.total = -1;
	}
	else {
		const requestFilters = params.toString() != "" ? getRequestFilters(params) : [];
		let statsTotal = 0;
		listBuilder:
		for (const id in greetings) {
			const greeting = greetings[id];
			if (greeting === undefined) continue;
			for (const [filterKey, filterValue] of requestFilters) {
				if (!filters[filterKey](greeting, filterValue))
					continue listBuilder;
			}
			for (const field in statsList) {
				if (field == "titles") continue;
				for (const value of greeting[field])
					incrementStat(field, value);
			}
			statsTotal++;
		}
		statsList.total = statsTotal;
	}
	return statsList;
}

// Safely fill HTML template with supplied variables
function buildHtml(template, definitions) {
	const varData = [];
	for (const [key, value] of Object.entries(definitions)) {
		const keyExp = new RegExp(`(?:(^|\n)(\t*))?\\{${key}(?:\\?(.*?(?<!\\{VALUE)))?\\}`, "gs");
		for (let match; (match = keyExp.exec(template)) !== null;) {
			const newLine = match[1] ?? "";
			const tabs = match[2] ?? "";
			const inlineValue = match[3];
			const realValue = value ? newLine + (
				inlineValue !== undefined
					? tabs + inlineValue.replace("{VALUE}", typeof value == "string" ? value : "")
					: value.replaceAll(/^/gm, tabs)
			) : "";
			varData.push({
				value: realValue,
				start: match.index,
				end: match.index + match[0].length
			});
		}
	}
	let offset = 0;
	let html = "";
	for (const entry of varData.toSorted((a, b) => a.start - b.start)) {
		html += template.substring(0, entry.start - offset) + entry.value;
		template = template.substring(entry.end - offset);
		offset = entry.end;
	}
	return html + template;
}

// Populate options bar with download links
function buildDownloads(definitions) {
	const downloadLinks = [];
	for (const downloadTitle in definitions) {
		const downloadPath = definitions[downloadTitle];
		if (downloadPath !== undefined) downloadLinks.push(`<a class="greetmaster-greeting-options-button" href="/data/${downloadPath}">${downloadTitle}</a>`);
	}
	return downloadLinks.length > 0 ? downloadLinks.join("") : false;
}

// Extract filters from query string
function getRequestFilters(params) {
	const paramKeys = [...params.keys()];
	const paramValues = [...params.values()];
	const requestFilters = paramKeys
		.map((paramKey, i) => [paramKey, paramValues[i]])
		.filter(param => param[1] != "" && Object.keys(filters).some(validFilter => param[0] == validFilter))
		.slice(0, 16);
	return requestFilters;
}

// Return contents of template files
function getTemplate(file) { return Deno.readTextFileSync(`templates/${file}`); }

// Run Deno.lstat without throwing error if path doesn't exist
function getPathInfo(path) {
	try { return Deno.lstatSync(path); } catch {}
	return null;
}

// Remove unwanted characters and whitespace surrounding a string
function trimString(string) {
	string = string.trim();
	return string
		.replace((string.startsWith("(") && string.endsWith(")")) ? /^\("?(.*?)"?\)$/s : /^"?(.*?)"?$/s, "$1")
		.replace(/[\r\n]+/g, "").trim();
}

// Log to the appropriate locations
function logMessage(message) {
	message = `[${new Date().toLocaleString()}] ${message}`;
	if (config.logToConsole) console.log(message);
	if (config.logFile) try { Deno.writeTextFile(config.logFile, message + "\n", { append: true }); } catch {}
}

// 400 Bad Request
class BadRequestError extends Error {
	constructor(message) {
		super(message);
		this.name = this.constructor.name;
		this.status = 400;
		this.statusText = "Bad Request";
	}
}

// 404 Not Found
class NotFoundError extends Error {
	constructor(message) {
		super(message);
		this.name = this.constructor.name;
		this.status = 404;
		this.statusText = "Not Found";
	}
}