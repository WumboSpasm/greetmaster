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
	greetingIndex: "greetings.json",
	filesystemIndex: "files.json",
	logFile: "server.log",
	logToConsole: true,
};

// Define templates
const templates = {
	main:		getTemplate("main.html"),
	greeting:	getTemplate("greeting.html"),
	about:		getTemplate("about.html"),
	error:		getTemplate("error.html"),
};

// Define command-line flags and their default values
const flags = parseArgs(Deno.args, {
	string: ["config"],
	default: { "config": "config.json" },
});

// Attempt to load config file
if (getPathInfo(flags["config"])?.isFile) {
	Object.assign(config, JSON.parse(await Deno.readTextFile(flags["config"])));
	logMessage(`loaded config file: ${await Deno.realPath(flags["config"])}`);
}

const greetings = JSON.parse(await Deno.readTextFile(config.greetingIndex));
logMessage(`loaded greeting index: ${await Deno.realPath(config.greetingIndex)}`);

const filesystem = JSON.parse(await Deno.readTextFile(config.filesystemIndex));
logMessage(`loaded filesystem index: ${await Deno.realPath(config.filesystemIndex)}`);

const typeMap = {
	"flashEcard":			"Flash E-Card",
	"htmlEcard":			"HTML E-Card",
	"animatedTextEcard":	"Animated Text E-Card",
	"photoVideoEcard":		"Photo/Video E-Card",
	"imageEcard":			"Image E-Card",
	"downloadableEcard":	"Downloadable E-Card",
	"javaEcard":			"Java E-Card",
	"shockwaveEcard":		"Shockwave E-Card",
	//"wallpaper":			"Wallpaper",
	"wallpaperPreview":		"Wallpaper Preview",
	"screensaverPreview":	"Screensaver Preview",
	"creataMailTemplate":	"CreataMail Template",
	//"creataMailClipArt":	"CreataMail Clip Art",
	//"creataMailIcon":		"CreataMail Icon",
	//"creataMailAudio":	"CreataMail Audio",
	//"createPrintCard":	"Create & Print Card",
};
const supportedTypes = Object.keys(typeMap);

const fields = ["titles", "categories", "sources", "type", "thumbnail", "files"];

const filters = {
	"search": (greeting, value) => greeting.titles.concat(greeting.categories).some(entry => entry.toLowerCase().replace("<br>", " ").includes(value.toLowerCase())),
	"title": (greeting, value) => greeting.titles.includes(value),
	"category": (greeting, value) => greeting.categories.includes(value),
	"source": (greeting, value) => greeting.sources.includes(value),
	"type": (greeting, value) => greeting.type == value,
};

const urlExps = [/((?:href|src|action|background) *= *)("(?:(?!>).)+?"|[^ >]+)/gis, /(url *)(\(.+?\))/gis];

// Handle server requests
const serverHandler = async (request, info) => {
	logMessage(info.remoteAddr.hostname + ": " + request.url);

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
		case "": {
			let page = templates.main;
			let pageTitle = "Greetmaster";
			let pageStyle = "";
			let pageNamespace = "";
			let pageContent = "";
			if (params.has("id")) {
				const greeting = greetings[params.get("id")];
				if (!validGreeting(greeting)) throw new BadRequestError();
				pageTitle = `${typeMap[greeting.type]} at Greetmaster`;
				if (greeting.titles.length > 0) pageTitle = `${greeting.titles[0].replace(/<br>/i, " ")} - ${pageTitle}`;
				pageNamespace = "greeting";
				let greetingPath;
				let greetingStyle = "";
				let greetingBody = "";
				if ((greetingPath = greeting.files.find(path => /\.html$/.test(path))) !== undefined) {
					greetingStyle = "greetmaster-html-container";
					[greetingBody, pageStyle] = getPageData(redirectLinks(await getPage(greetingPath), greetingPath));
					greetingBody = `<!--${greetingBody.replaceAll("<!--", "&lt;!--").replaceAll("-->", "--&gt;")}-->`;
				}
				else if ((greetingPath = greeting.files.find(path => /\.sw[ft]$/.test(path))) !== undefined) {
					greetingStyle = "greetmaster-flash-container";
					greetingBody = "strFlashHTML";
				}
				else if ((greetingPath = greeting.files.find(path => /\/product\/full\/\d{7}f\.gif$/.test(path))) !== undefined) {
					greetingStyle = "greetmaster-image-container";
					greetingBody = `<img src="/data/${greetingPath}">`;
				}
				else if ((greetingPath = greeting.files.find(path => [/\/product\/preview\/slideshows\/exe\/\d{7}f\.exe$/, /\.dcr$/].some(pathExp => pathExp.test(path)))) !== undefined) {
					greetingStyle = "greetmaster-emu-container";
					greetingBody = `<div id="greetmaster-emu-placeholder" data-src="/data/${greetingPath}"></div>`;
				}
				else {
					greetingStyle = "greetmaster-unsupported-container";
					greetingBody = "Unfortunately, this e-card is currently not supported.";
				}
				if (greetingBody.includes("strFlashHTML")) {
					const flashPath = greeting.files.find(path => /\.swf$/.test(path)) ?? greeting.files.find(path => /\.swt$/.test(path));
					if (flashPath !== undefined) {
						const flashInfo = filesystem[flashPath];
						const flashAttrString = [
							`data-src="/data/${flashPath}"`,
							`data-width="${flashInfo.width}"`,
							`data-height="${flashInfo.height}"`,
							`data-protected="${flashInfo.protected}"`,
						].join(" ");
						greetingBody = greetingBody.replace("strFlashHTML", `<div id="greetmaster-flash-placeholder" ${flashAttrString}></div>`);
					}
				}
				pageContent = templates.greeting
					.replace("{STYLE}", greetingStyle)
					.replace("{TYPE}", greeting.type)
					.replace("{BODY}",  greetingBody);
			}
			else
				pageNamespace = "home";
			const pageSearch = stringifyEntities((params.get("search") ?? "").substring(0, 64), { escapeOnly: true });
			page = page
				.replaceAll("{NAMESPACE}", pageNamespace)
				.replace("{TITLE}", pageTitle)
				.replace("{STYLE}", pageStyle)
				.replace("{CONTENT}", pageContent)
				.replace("{SEARCH}", pageSearch);
			return new Response(page, { headers: { "Content-Type": "text/html; charset=UTF-8" } });
		}
		case "get": {
			const greetingList = {};
			let requestFields = params.getAll("field").filter(field => fields.some(validField => field == validField));
			if (requestFields.length == 0) requestFields = fields;
			if (params.has("id")) {
				const id = params.get("id");
				const greeting = greetings[id];
				if (validGreeting(greeting)) {
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
						if (!validGreeting(greeting) || requestFilters.some(([key, value]) => !filters[key](greeting, value)))
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
			const statsList = { total: -1 };
			const statFields = {
				array: ["titles", "categories", "sources"],
				single: [["type", "types"]],
			};
			for (const field of statFields.array) statsList[field] = {};
			for (const field of statFields.single) statsList[field[1]] = {};
			const incrementStat = (stat, field) => {
				if (statsList[stat][field] === undefined)
					statsList[stat][field] = 1;
				else
					statsList[stat][field]++;
			};
			if (params.has("id")) {
				const compareGreeting = greetings[parseInt(params.get("id"))];
				if (validGreeting(compareGreeting)) {
					for (const id in greetings) {
						const greeting = greetings[id];
						if (!validGreeting(greeting)) continue;
						for (const field of statFields.array) {
							for (const value of greeting[field]) {
								if (compareGreeting[field].includes(value))
									incrementStat(field, value);
							}
						}
						for (const field of statFields.single) {
							if (filters[field[0]](compareGreeting, greeting[field[0]]))
								incrementStat(field[1], greeting[field[0]]);
						}
					}
				}
			}
			else {
				const requestFilters = getRequestFilters(params);
				statsList.total = 0;
				listBuilder:
				for (const id in greetings) {
					const greeting = greetings[id];
					if (!validGreeting(greeting)) continue;
					for (const [filterKey, filterValue] of requestFilters) {
						if (!filters[filterKey](greeting, filterValue))
							continue listBuilder;
					}
					for (const field of statFields.array) {
						if (field == "titles") continue;
						for (const value of greeting[field])
							incrementStat(field, value);
					}
					for (const field of statFields.single)
						incrementStat(field[1], greeting[field[0]]);
					statsList.total++;
				}
			}
			for (const field in statsList) {
				if (field == "total") continue;
				statsList[field] = Object.fromEntries(Object.entries(statsList[field]).toSorted(([,a], [,b]) => b - a));
			}
			return new Response(JSON.stringify(statsList), { headers: { "Content-Type": "application/json; charset=UTF-8" } });
		}
		case "about": {
			return new Response(templates.about, { headers: { "Content-Type": "text/html; charset=UTF-8" } });
		}
		default: {
			if (!requestPath.startsWith("data/")) requestPath = `static/${requestPath}`;
			if (!getPathInfo(requestPath)?.isFile) throw new NotFoundError();
			const type = contentType(requestPath.substring(requestPath.lastIndexOf("."))) ?? "application/octet-stream";
			return new Response(await getFileStream(requestPath), { headers: { "Content-Type": type }});
		}
	}
};

// Display error page
const serverError = (error) => {
	const [badRequest, notFound] = [error instanceof BadRequestError, error instanceof NotFoundError];
	let errorPage = templates.error;
	if (badRequest || notFound)
		errorPage = errorPage
			.replaceAll("{STATUSTEXT}", `${error.status} ${error.statusText}`)
			.replaceAll("{MESSAGE}", badRequest ? "The requested URL is invalid." : "The requested URL does not exist.");
	else {
		logMessage(error.stack);
		errorPage = errorPage
			.replaceAll("{STATUSTEXT}", "500 Internal Server Error")
			.replaceAll("{MESSAGE}", "The server encountered an error while handling the request.");
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

async function getPage(pagePath) {
	let page;
	const pageEncoding = filesystem[pagePath].encoding;
	if (pageEncoding == "ASCII" || pageEncoding == "UTF-8")
		page = await Deno.readTextFile(`data/${pagePath}`);
	else
		page = new TextDecoder().decode((await new Deno.Command("iconv", { args: [`data/${pagePath}`, "-cf", pageEncoding, "-t", "UTF-8"], stdout: "piped" }).output()).stdout);
	return page.replaceAll(/[\r\n]+/g, "\n");
}

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

function getPageData(page) {
	const attrExp = /([a-z]+) *= *("(?:(?!>).)+?"|[^ >]+)/gis;
	let bodyContent = page;
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
		if (styles.length > 0) styleElement = `\t\t<style>\n${styles.map(style => `\t\t\t${style}`).join("\n")}\n\t\t</style>`;
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
	return [bodyContent, styleElement];
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

// Check if greeting is available and of a supported type
function validGreeting(greeting) { return greeting !== undefined && greeting.available && supportedTypes.includes(greeting.type); }

// Return contents of template files
function getTemplate(file) { return Deno.readTextFileSync(`templates/${file}`); }

// Run Deno.lstat without throwing error if path doesn't exist
function getPathInfo(path) {
	try { return Deno.lstatSync(path); } catch {}
	return null;
}

// Retrieve file data without consuming memory
async function getFileStream(path) { return (await fetch(new URL(path, import.meta.url))).body; }

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