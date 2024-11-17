import express, { RequestHandler } from "express";
import compression from "compression";
import cors from "cors";
import { is } from "superstruct";
import "dotenv/config";

import { SystemConfig, SystemConfigWithName } from "./types.js";
import Data from "./data.js";
import DB from "./db.js";

main();

async function main() {
	console.info("transit-map server starting");

	const port = process.env.PORT ?? 8000;
	const app = express();

	const db = await DB.new(
		new URL(process.env.DB ?? "sqlite:./transit-map.sqlite")
	);
	const data = await Data.new(db);

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

	app.post("/api/new", auth, express.json(), async (req, res) => {
		try {
			const config = req.body;

			if (!is(config, SystemConfigWithName)) {
				res.status(400).type("text/plain").send("Incorrect request body type");
				return;
			}

			const success = await data.add_config(config.name, {
				location: config.location,
				gtfs: config.gtfs,
				realtime: config.realtime,
			});

			if (success) {
				res.status(201).location(`/api/${config.name}/config`).end();
				return;
			} else {
				res
					.status(409)
					.type("text/plain")
					.send("A system with the requested name already exists");
				return;
			}
		} catch (e) {
			res.status(500).type("text/plain").send(`Internal Server Error:\n${e}`);
			console.error(
				`Internal Server Error: ${e} (${e instanceof Error ? e.stack : "???"})`
			);
		}
	});

	app.put("/api/:system/config", auth, express.json(), async (req, res) => {
		try {
			const { system } = req.params;

			if (!data.has_system(system)) {
				res
					.status(404)
					.type("text/plain")
					.send(`Transit system ${system} not found`);
				return;
			}

			const config = req.body;

			if (!is(config, SystemConfig)) {
				res.status(400).type("text/plain").send("Incorrect request body type");
				return;
			}

			await data.set_config(system, config);

			res.status(204).end();
		} catch (e) {
			res.status(500).type("text/plain").send(`Internal Server Error:\n${e}`);
			console.error(
				`Internal Server Error: ${e} (${e instanceof Error ? e.stack : "???"})`
			);
		}
	});

	app.delete("/api/:system/config", auth, async (req, res) => {
		try {
			const { system } = req.params;

			if (!data.has_system(system)) {
				res
					.status(404)
					.type("text/plain")
					.send(`Transit system ${system} not found`);
				return;
			}

			await data.delete_config(system);

			res.status(204).end();
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

	app.get("/api/:system/line/:line", async (req, res) => {
		try {
			const { system, line } = req.params;

			if (!data.has_system(system)) {
				res
					.status(404)
					.type("text/plain")
					.send(`Transit system ${system} not found`);
				return;
			}

			const l = await data.get_line(system, line);

			if (l === undefined) {
				res
					.status(404)
					.type("text/plain")
					.send(`Line ${line} not found in ${system}`);
				return;
			}

			res.json(l);
		} catch (e) {
			res.status(500).type("text/plain").send(`Internal Server Error:\n${e}`);
			console.error(
				`Internal Server Error: ${e} (${e instanceof Error ? e.stack : "???"})`
			);
		}
	});

	app.get("/api/:system/stop/:stop", async (req, res) => {
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
				console.info(
					"pre-caching static GTFS (use `--no-precache` to disable)"
				);
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
}

const auth: RequestHandler = (req, res, next) => {
	const token = req.header("Authorization");

	if (token === undefined) {
		res
			.status(401)
			.type("text/plain")
			.header("WWW-Authenticate", "Bearer")
			.send("Not authenticated");
		return;
	}

	if (token !== "the secret token (TODO: replace this with an actual check)") {
		res
			.status(403)
			.type("text/plain")
			.send("Not authorized to perform this request");
		return;
	}

	next();
};
