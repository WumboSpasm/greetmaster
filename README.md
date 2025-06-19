# Greetmaster
[Greetmaster](https://greetmaster.net/) is an e-card museum.

## Dependencies
A Linux environment with [Deno](https://deno.com/) and the `iconv` utility is required.

## Instructions
1. Download or clone the repository
2. Create `data` folder in repository root
3. Download [the dataset](https://archive.org/download/imgag.com/imgag.com.zip) and extract into `data` folder
4. Download [greetings.json](https://archive.org/download/greetmaster-metadata/greetings.json) and [files.json](https://archive.org/download/greetmaster-metadata/files.json) into repository root
5. Run server with `deno run -A main.js`