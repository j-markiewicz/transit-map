import express from "express";
import compression from "compression";
import cors from "cors";
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
		gtfs: {
			"https://gtfs.ztp.krakow.pl/GTFS_KRK_T.zip": {
				id: "t",
				max_age: "1d",
			},
			"https://gtfs.ztp.krakow.pl/GTFS_KRK_A.zip": {
				id: "a",
				max_age: "1d",
			},
		},
		realtime: {
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
		gtfs: {
			"https://kolejemalopolskie.com.pl/rozklady_jazdy/kml-ska-gtfs.zip": {
				id: "ska",
				max_age: "1d",
			},
			"https://kolejemalopolskie.com.pl/rozklady_jazdy/ald-gtfs.zip": {
				id: "bus",
				max_age: "1d",
			},
		},
		realtime: {},
	},
});

app.set("x-powered-by", false);
app.use(compression());
app.use(
	cors({
		origin: true,
		methods: ["GET"],
		credentials: true,
	})
);

app.all("*", (req, _, next) => {
	console.info(`${req.method} ${req.path}`);
	next();
});

app.options(
	"*",
	cors({
		origin: true,
		methods: ["GET"],
		credentials: true,
	})
);

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

app.get("/api/:system/config", async (req, res) => {
	try {
		const { system } = req.params;

		if (!data.has_system(system)) {
			res
				.status(404)
				.type("text/plain")
				.send(`Transit system ${system} not found`);
			return;
		}

		res.json({ ...data.get_config(system), can_edit: false });
	} catch (e) {
		res.status(500).type("text/plain").send(`Internal Server Error:\n${e}`);
		console.error(
			`Internal Server Error: ${e} (${e instanceof Error ? e.stack : "???"})`
		);
	}
});

app.put("/api/new", async (req, res) => {
	try {
		const token = req.header("Authorization");

		if (token === undefined) {
			res
				.status(401)
				.type("text/plain")
				.header("WWW-Authenticate", "Bearer")
				.send("Not authenticated");
			return;
		}

		res
			.status(403)
			.type("text/plain")
			.send("Not authorized to add a new transit system");
	} catch (e) {
		res.status(500).type("text/plain").send(`Internal Server Error:\n${e}`);
		console.error(
			`Internal Server Error: ${e} (${e instanceof Error ? e.stack : "???"})`
		);
	}
});

app.put("/api/:system/config", async (req, res) => {
	try {
		const { system } = req.params;
		const token = req.header("Authorization");

		if (!data.has_system(system)) {
			res
				.status(404)
				.type("text/plain")
				.send(`Transit system ${system} not found`);
			return;
		}

		if (token === undefined) {
			res
				.status(401)
				.type("text/plain")
				.header("WWW-Authenticate", "Bearer")
				.send("Not authenticated");
			return;
		}

		res
			.status(403)
			.type("text/plain")
			.send(
				`Not authorized to edit configuration for transit system ${system}`
			);
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
			console.info("pre-caching static GTFS (use `--no-precache` to disable)");
			data.precache();
		}
	})
	.once("listening", () => {
		if (!process.argv.includes("--no-refetch")) {
			console.info(
				"automatic GTFS refetching enabled - non-realtime data will be refetched on expiry (use `--no-refetch` to disable)"
			);
		}
	});
