const fieldMap = [
//	filter			stat			display name
	["search",		"search",		"Search Query"],
	["title",		"titles",		"Titles"],
	["type",		"types",		"Types"],
	["category",	"categories",	"Categories"],
	["source",		"sources",		"Sources"],
];

const pageExpandIcon = "var(--greetmaster-expand-icon)";
const pageCollapseIcon = "var(--greetmaster-collapse-icon)";

function loadSidebar() {
	const pageSidebar = document.querySelector(".greetmaster-sidebar");
	if (localStorage.getItem("greetmaster-sidebar-hidden") == "true")
		pageSidebar.classList.add("greetmaster-hidden");
	const pageSidebarButton = document.querySelector(".greetmaster-sidebar-button");
	pageSidebarButton.addEventListener("click", () => {
		pageSidebar.classList.toggle("greetmaster-hidden");
		const hidden = pageSidebar.classList.contains("greetmaster-hidden");
		localStorage.setItem("greetmaster-sidebar-hidden", hidden ? "true" : "false");
	});
	let statsUrl = "/stats";
	if (params.has("id"))
		statsUrl += `?id=${params.get("id")}`;
	else if (filterParamsString != "")
		statsUrl += `?${filterParamsString}`;
	fetch(statsUrl).then(response => response.json()).then(stats => {
		for (const [filter, stat, displayName] of fieldMap) {
			if (stats[stat] === undefined) stats[stat] = {};
			const filterValues = filterParams.getAll(filter);
			if (filterValues.length > 0) {
				for (const filterValue of filterValues) {
					const filterValueLower = filterValue.toLowerCase()
					if (Object.keys(stats[stat]).find(statEntryName => filterValueLower == statEntryName.toLowerCase()) === undefined)
						stats[stat][filterValue] = stats.total;
				}
			}
			const statEntries = Object.entries(stats[stat]);
			if (statEntries.length == 0) continue;
			const pageStatEntries = document.createDocumentFragment();
			for (const [statEntryName, statEntryCount] of statEntries.toSorted(([,a], [,b]) => b - a)) {
				const pageStatEntry = document.createElement("a");
				pageStatEntry.classList.add("greetmaster-sidebar-entry", "greetmaster-stat-entry");
				const pageStatEntryName = document.createElement("div");
				pageStatEntryName.className = "greetmaster-sidebar-entry-left";
				pageStatEntryName.textContent = statEntryName.replace(/<br>/gi, "\n").replace(/\n+/g, "\n");
				const pageStatEntryCount = document.createElement("div");
				pageStatEntryCount.className = "greetmaster-sidebar-entry-right";
				pageStatEntryCount.textContent = statEntryCount.toLocaleString();
				pageStatEntry.append(pageStatEntryName, pageStatEntryCount);
				if (filterParams.getAll(filter).some(filterValue => statEntryName.toLowerCase() == filterValue.toLowerCase())) {
					const newFilterParams = new URLSearchParams(filterParams);
					newFilterParams.delete(filter, statEntryName);
					const newFilterParamsString = newFilterParams.toString();
					pageStatEntry.href = newFilterParamsString != "" ? `/?${newFilterParams.toString()}` : "/";
					pageStatEntry.classList.add("greetmaster-stat-entry-applied");
					pageStatEntries.prepend(pageStatEntry);
				}
				else {
					let statEntryParamsString = new URLSearchParams([[filter, statEntryName]]).toString();
					if (filterParamsString != "") statEntryParamsString = `${filterParamsString}&${statEntryParamsString}`;
					pageStatEntry.href = `/?${statEntryParamsString}`;
					pageStatEntries.append(pageStatEntry);
				}
			}
			const pageStatContainer = document.createElement("div");
			pageStatContainer.classList.add("greetmaster-stat-container");
			pageStatContainer.id = `greetmaster-${stat}`;
			pageStatContainer.append(pageStatEntries);
			const pageStatHeader = document.createElement("div");
			pageStatHeader.classList.add("greetmaster-sidebar-entry", "greetmaster-stat-header");
			pageStatHeader.id = pageStatContainer.id;
			const pageStatHeaderName = document.createElement("div");
			pageStatHeaderName.className = "greetmaster-sidebar-entry-left";
			pageStatHeaderName.textContent = displayName;
			const pageStatHeaderArrow = document.createElement("div");
			pageStatHeaderArrow.className = "greetmaster-sidebar-entry-right";
			pageStatHeaderArrow.style.backgroundImage = pageCollapseIcon;
			pageStatHeader.addEventListener("click", () => {
				pageStatContainer.hidden = !pageStatContainer.hidden;
				pageStatHeaderArrow.style.backgroundImage = pageStatContainer.hidden ? pageExpandIcon : pageCollapseIcon;
			});
			pageStatHeader.append(pageStatHeaderName, pageStatHeaderArrow);
			pageSidebar.append(pageStatHeader, pageStatContainer);
		}
	});
}

document.addEventListener("DOMContentLoaded", loadSidebar);