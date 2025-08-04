const params = new URL(location.href).searchParams;

const filterParams = (() => {
	const validFilters = ["search", "title", "category", "source", "type"];
	const paramKeys = [...params.keys()];
	const paramValues = [...params.values()];
	const filters = paramKeys
		.map((paramKey, i) => [paramKey, paramValues[i]])
		.filter(param => param[1] != "" && validFilters.some(validFilter => param[0] == validFilter))
		.slice(0, 16);
	const filterParams = new URLSearchParams();
	for (const filter of filters)
		filterParams.append(...filter);
	return filterParams;
})();

const filterParamsString = filterParams.toString();