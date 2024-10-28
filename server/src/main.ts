import express from "express";
import compression from "compression";
import "dotenv/config";

import Data from "./data.js";

const port = process.env.PORT ?? 8000;
const app = express();

const data = new Data({
	Kraków: {
		location: [
			[50.1233, 19.7575],
			[49.9628, 20.1764],
		],
		raw_gtfs: {
			"https://gtfs.ztp.krakow.pl/GTFS_KRK_T.zip": {
				id: "t",
				max_age: "1d",
			},
			"https://gtfs.ztp.krakow.pl/GTFS_KRK_A.zip": {
				id: "a",
				max_age: "1d",
			},
		},
		raw_realtime: {
			"https://gtfs.ztp.krakow.pl/VehiclePositions_T.pb": {
				id: "t",
				max_age: "20s",
			},
			"https://gtfs.ztp.krakow.pl/VehiclePositions_A.pb": {
				id: "a",
				max_age: "20s",
			},
			"https://gtfs.ztp.krakow.pl/TripUpdates_T.pb": {
				id: "t",
				max_age: "20s",
			},
			"https://gtfs.ztp.krakow.pl/TripUpdates_A.pb": {
				id: "a",
				max_age: "20s",
			},
			"https://gtfs.ztp.krakow.pl/ServiceAlerts_T.pb": {
				id: "t",
				max_age: "5m",
			},
			"https://gtfs.ztp.krakow.pl/ServiceAlerts_A.pb": {
				id: "a",
				max_age: "5m",
			},
		},
	},
	"Koleje Małopolskie": {
		location: [
			[50.6, 21.5],
			[49.45, 19],
		],
		raw_gtfs: {
			"https://kolejemalopolskie.com.pl/rozklady_jazdy/kml-ska-gtfs.zip": {
				id: "ska",
				max_age: "1d",
			},
			"https://kolejemalopolskie.com.pl/rozklady_jazdy/ald-gtfs.zip": {
				id: "bus",
				max_age: "1d",
			},
		},
		raw_realtime: {},
	},
});

app.set("x-powered-by", false);
app.use(compression());

app.all(/.*/giu, (req, _, next) => {
	console.info(`${req.method} ${req.path}`);
	next();
});

app.get("/api", async (req, res) => {
	try {
		res.json(await data.get_all_info());
	} catch (e) {
		res.status(500).type("text/plain").send(`Internal Server Error:\n${e}`);
		console.error(
			`Internal Server Error: ${e} (${e instanceof Error ? e.stack : "???"})`
		);
	}
});

app.get("/api/:system", async (req, res) => {
	try {
		const { system } = req.params;

		if (!data.has_system(system)) {
			res
				.status(404)
				.type("text/plain")
				.send(`Transit system ${system} not found`);
			return;
		}

		res.json(await data.get_info(system));
	} catch (e) {
		res.status(500).type("text/plain").send(`Internal Server Error:\n${e}`);
		console.error(
			`Internal Server Error: ${e} (${e instanceof Error ? e.stack : "???"})`
		);
	}
});

app.get("/api/:system/alerts", async (req, res) => {
	try {
		const { system } = req.params;

		if (!data.has_system(system)) {
			res
				.status(404)
				.type("text/plain")
				.send(`Transit system ${system} not found`);
			return;
		}

		res.json(await data.get_alerts(system));
	} catch (e) {
		res.status(500).type("text/plain").send(`Internal Server Error:\n${e}`);
		console.error(
			`Internal Server Error: ${e} (${e instanceof Error ? e.stack : "???"})`
		);
	}
});

app.get("/api/:system/vehicles", async (req, res) => {
	try {
		const { system } = req.params;

		if (!data.has_system(system)) {
			res
				.status(404)
				.type("text/plain")
				.send(`Transit system ${system} not found`);
			return;
		}

		res.json(await data.get_vehicles(system));
	} catch (e) {
		res.status(500).type("text/plain").send(`Internal Server Error:\n${e}`);
		console.error(
			`Internal Server Error: ${e} (${e instanceof Error ? e.stack : "???"})`
		);
	}
});

app.get("/api/:system/stops", async (req, res) => {
	try {
		const { system } = req.params;

		if (!data.has_system(system)) {
			res
				.status(404)
				.type("text/plain")
				.send(`Transit system ${system} not found`);
			return;
		}

		res.json(await data.get_stops(system));
	} catch (e) {
		res.status(500).type("text/plain").send(`Internal Server Error:\n${e}`);
		console.error(
			`Internal Server Error: ${e} (${e instanceof Error ? e.stack : "???"})`
		);
	}
});

app.get("/api/:system/lines", async (req, res) => {
	try {
		const { system } = req.params;

		if (!data.has_system(system)) {
			res
				.status(404)
				.type("text/plain")
				.send(`Transit system ${system} not found`);
			return;
		}

		res.json(await data.get_lines(system));
	} catch (e) {
		res.status(500).type("text/plain").send(`Internal Server Error:\n${e}`);
		console.error(
			`Internal Server Error: ${e} (${e instanceof Error ? e.stack : "???"})`
		);
	}
});

app.get("/api/:system/stop_schedule/:stop", async (req, res) => {
	try {
		const { system, stop } = req.params;

		if (!data.has_system(system)) {
			res
				.status(404)
				.type("text/plain")
				.send(`Transit system ${system} not found`);
			return;
		}

		const sched = await data.get_stop_schedule(system, stop);

		if (sched === undefined) {
			res
				.status(404)
				.type("text/plain")
				.send(`Stop ${stop} not found in ${system}`);
			return;
		}

		res.json(sched);
	} catch (e) {
		res.status(500).type("text/plain").send(`Internal Server Error:\n${e}`);
		console.error(
			`Internal Server Error: ${e} (${e instanceof Error ? e.stack : "???"})`
		);
	}
});

app.get("/api/:system/line_schedule/:line", async (req, res) => {
	try {
		const { system, line } = req.params;

		if (!data.has_system(system)) {
			res
				.status(404)
				.type("text/plain")
				.send(`Transit system ${system} not found`);
			return;
		}

		const sched = await data.get_line_schedule(system, line);

		if (sched === undefined) {
			res
				.status(404)
				.type("text/plain")
				.send(`Line ${line} not found in ${system}`);
			return;
		}

		res.json(sched);
	} catch (e) {
		res.status(500).type("text/plain").send(`Internal Server Error:\n${e}`);
		console.error(
			`Internal Server Error: ${e} (${e instanceof Error ? e.stack : "???"})`
		);
	}
});

app.get("/api/:system/shape/:shape", async (req, res) => {
	try {
		const { system, shape } = req.params;

		if (!data.has_system(system)) {
			res
				.status(404)
				.type("text/plain")
				.send(`Transit system ${system} not found`);
			return;
		}

		const s = await data.get_shape(system, shape);

		if (s === undefined) {
			res
				.status(404)
				.type("text/plain")
				.send(`Shape ${shape} not found in ${system}`);
			return;
		}

		res.json(s);
	} catch (e) {
		res.status(500).type("text/plain").send(`Internal Server Error:\n${e}`);
		console.error(
			`Internal Server Error: ${e} (${e instanceof Error ? e.stack : "???"})`
		);
	}
});

app
	.listen(port)
	.once("listening", () => console.info(`Server listening on port ${port}`))
	.once("listening", () => {
		if (!process.argv.includes("--no-precache")) {
			console.debug("pre-caching static GTFS");
			data.precache();
		}
	});
