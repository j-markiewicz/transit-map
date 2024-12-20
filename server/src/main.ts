import { fileURLToPath, pathToFileURL } from "url";
import express from "express";
import { is } from "superstruct";
import { Temporal } from "temporal-polyfill";
import cookie_parser from "cookie-parser";
import compression from "compression";
import jwt from "jsonwebtoken";
import fs from "fs/promises";
import cors from "cors";
import "dotenv/config";

import { Credentials, SystemConfig, SystemConfigWithName } from "./types.js";
import { auth, random, verify_password } from "./auth.js";
import Data from "./data.js";
import DB from "./db.js";

main();

async function main() {
	console.info("transit-map server starting");

	const db = await DB.new(
		new URL(process.env.DB ?? "sqlite:./transit-map.sqlite")
	);
	const data = await Data.new(db);

	if (process.argv[2] === "dump") {
		const location = new URL("./dump/", pathToFileURL(process.cwd()));
		await fs.mkdir(location);

		const path = (file: string) => new URL(file, location);

		console.info(`Creating data dump in '${fileURLToPath(location)}'`);

		const all_info = await data.get_all_info().catch(() => undefined);
		await fs.writeFile(
			path(`index.json`),
			JSON.stringify(all_info ?? null),
			"utf-8"
		);

		for (const system of all_info ?? []) {
			const promises = [];
			await fs.mkdir(path(`${system.name}`)).catch(console.warn);

			promises.push(
				fs.writeFile(
					path(`${system.name}/index.json`),
					JSON.stringify(
						(await data.get_info(system.name)?.catch(() => undefined)) ?? null
					),
					"utf-8"
				)
			);

			await fs.mkdir(path(`${system.name}/config`)).catch(console.warn);
			const config = data.get_config(system.name);
			promises.push(
				fs.writeFile(
					path(`${system.name}/config/index.json`),
					JSON.stringify({
						location: config?.location,
						gtfs: config?.gtfs,
						realtime: config?.realtime,
						can_edit: false,
					}),
					"utf-8"
				)
			);

			await fs.mkdir(path(`${system.name}/alerts`)).catch(console.warn);
			promises.push(
				fs.writeFile(
					path(`${system.name}/alerts/index.json`),
					JSON.stringify(
						(await data.get_alerts(system.name)?.catch(() => undefined)) ?? null
					),
					"utf-8"
				)
			);

			await fs.mkdir(path(`${system.name}/vehicles`)).catch(console.warn);
			promises.push(
				fs.writeFile(
					path(`${system.name}/vehicles/index.json`),
					JSON.stringify(
						(await data.get_vehicles(system.name)?.catch(() => undefined)) ??
							null
					),
					"utf-8"
				)
			);

			await fs.mkdir(path(`${system.name}/stops`)).catch(console.warn);
			const stops = await data.get_stops(system.name)?.catch(() => undefined);
			promises.push(
				fs.writeFile(
					path(`${system.name}/stops/index.json`),
					JSON.stringify(stops ?? null),
					"utf-8"
				)
			);

			await fs.mkdir(path(`${system.name}/lines`)).catch(console.warn);
			const lines = await data.get_lines(system.name)?.catch(() => undefined);
			promises.push(
				fs.writeFile(
					path(`${system.name}/lines/index.json`),
					JSON.stringify(lines ?? null),
					"utf-8"
				)
			);

			await fs.mkdir(path(`${system.name}/stop`)).catch(console.warn);
			for (const stop of stops ?? []) {
				await fs
					.mkdir(path(`${system.name}/stop/${stop.id}`))
					.catch(console.warn);
				promises.push(
					fs.writeFile(
						path(`${system.name}/stop/${stop.id}/index.json`),
						JSON.stringify(
							(await data
								.get_stop_schedule(system.name, stop.id)
								?.catch(() => undefined)) ?? null
						),
						"utf-8"
					)
				);
			}

			const shapes = new Set<string>();

			await fs.mkdir(path(`${system.name}/line`)).catch(console.warn);
			for (const line of lines ?? []) {
				line.shape.forEach((s) => shapes.add(s));

				await fs
					.mkdir(path(`${system.name}/line/${line.id}`))
					.catch(console.warn);
				promises.push(
					fs.writeFile(
						path(`${system.name}/line/${line.id}/index.json`),
						JSON.stringify(
							(await data
								.get_line(system.name, line.id)
								?.catch(() => undefined)) ?? null
						),
						"utf-8"
					)
				);
			}

			await fs.mkdir(path(`${system.name}/shape`)).catch(console.warn);
			for (const shape of shapes.values()) {
				await fs
					.mkdir(path(`${system.name}/shape/${shape}`))
					.catch(console.warn);
				promises.push(
					fs.writeFile(
						path(`${system.name}/shape/${shape}/index.json`),
						JSON.stringify(
							(await data
								.get_shape(system.name, shape)
								?.catch(() => undefined)) ?? null
						),
						"utf-8"
					)
				);
			}

			const info =
				(await data.get_info(system.name)?.catch(() => undefined)) ?? null;

			if (info !== null) {
				promises.push(
					fs.writeFile(
						path(`${system.name}/index.json`),
						JSON.stringify(info),
						"utf-8"
					)
				);
			}

			await Promise.all(promises);
		}

		await fs.writeFile(
			path(`index.json`),
			JSON.stringify((await data.get_all_info().catch(() => all_info)) ?? null),
			"utf-8"
		);

		process.once("exit", () =>
			console.info(`Saved full data dump in '${fileURLToPath(location)}'`)
		);
		process.exit(0);
	}

	const api_token_secret = await random();

	const port = process.env.PORT ?? 8000;
	const app = express();

	app.set("x-powered-by", false);
	app.use(compression());
	app.use(
		cors({
			origin: true,
			methods: ["GET", "HEAD", "POST", "PUT", "DELETE", "OPTIONS"],
			credentials: true,
		})
	);

	app.all("*", (req, _, next) => {
		console.info(`${req.method} ${req.path}`);
		next();
	});

	app.post("/auth/login", express.json(), async (req, res) => {
		try {
			if (!is(req.body, Credentials)) {
				res.status(400).type("text/plain").send("Incorrect request body type");
				return;
			}

			const { email, password } = req.body;

			const user = await db.get_user_by_email(email);

			if (user === undefined) {
				res.status(404).type("text/plain").send("User not found");
				return;
			}

			if (user.provider !== null) {
				res
					.status(403)
					.type("text/plain")
					.send("Password login disabled for this account");
				return;
			}

			const password_correct = await verify_password(
				password,
				user.authenticator
			);

			if (!password_correct) {
				res.status(403).type("text/plain").send("Password incorrect");
				return;
			}

			const token = await random();
			const expires = Temporal.Now.instant().add({ hours: 2 * 7 * 24 });

			await db.set_user_token(email, token, expires);

			res.cookie("__Secure-auth", token, {
				httpOnly: true,
				secure: true,
				expires: new Date(expires.epochMilliseconds),
				partitioned: true,
				path: "/auth",
				sameSite: "none",
			});

			res.status(204).end();
		} catch (e) {
			res.status(500).type("text/plain").send(`Internal Server Error:\n${e}`);
			console.error(
				`Internal Server Error: ${e} (${e instanceof Error ? e.stack : "???"})`
			);
		}
	});

	app.post("/auth/logout", cookie_parser(), async (req, res) => {
		try {
			const user_token = req.cookies["__Secure-auth"];

			res.cookie("__Secure-auth", "", {
				httpOnly: true,
				secure: true,
				expires: new Date(1),
				partitioned: true,
				path: "/auth",
				sameSite: "strict",
			});

			if (user_token === undefined) {
				res
					.status(401)
					.type("text/plain")
					.header("WWW-Authenticate", "Cookie")
					.send("Not authenticated");
				return;
			}

			const success = await db.delete_user_token(user_token);

			if (success !== true) {
				res.status(403).type("text/plain").send("Token incorrect");
				return;
			}

			res.status(204).end();
		} catch (e) {
			res.status(500).type("text/plain").send(`Internal Server Error:\n${e}`);
			console.error(
				`Internal Server Error: ${e} (${e instanceof Error ? e.stack : "???"})`
			);
		}
	});

	app.post("/auth/gen_token", cookie_parser(), async (req, res) => {
		try {
			const user_token = req.cookies["__Secure-auth"];

			if (user_token === undefined) {
				res
					.status(401)
					.type("text/plain")
					.header("WWW-Authenticate", "Cookie")
					.send("Not authenticated");
				return;
			}

			const user = await db.get_user_by_user_token(
				user_token,
				Temporal.Now.instant().add({ hours: 2 * 7 * 24 })
			);

			if (user === undefined) {
				res.status(403).type("text/plain").send("Token incorrect");
				return;
			}

			const api_token = jwt.sign(
				user.is_admin
					? { user: user.email, is_admin: user.is_admin }
					: { user: user.email },
				api_token_secret,
				{
					algorithm: "HS512",
					issuer: "transit-map",
					expiresIn: "5m",
				}
			);

			res.status(200).type("text/plain").send(api_token);
		} catch (e) {
			res.status(500).type("text/plain").send(`Internal Server Error:\n${e}`);
			console.error(
				`Internal Server Error: ${e} (${e instanceof Error ? e.stack : "???"})`
			);
		}
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

	app.get(
		"/api/:system/config",
		auth(api_token_secret, false),
		async (req, res) => {
			try {
				const { system } = req.params;

				if (!data.has_system(system)) {
					res
						.status(404)
						.type("text/plain")
						.send(`Transit system ${system} not found`);
					return;
				}

				const config = data.get_config(system);

				res.json({
					location: config?.location,
					gtfs: config?.gtfs,
					realtime: config?.realtime,
					can_edit:
						(req.user !== undefined && config?.owner === req.user) ||
						req.is_admin === true,
				});
			} catch (e) {
				res.status(500).type("text/plain").send(`Internal Server Error:\n${e}`);
				console.error(
					`Internal Server Error: ${e} (${
						e instanceof Error ? e.stack : "???"
					})`
				);
			}
		}
	);

	app.post(
		"/api/new",
		auth(api_token_secret),
		express.json(),
		async (req, res) => {
			try {
				const config = req.body;

				if (!is(config, SystemConfigWithName)) {
					res
						.status(400)
						.type("text/plain")
						.send("Incorrect request body type");
					return;
				}

				if (req.user === undefined) {
					throw new Error("no user email set on request");
				}

				const success = await data.add_config(config.name, req.user, {
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
					`Internal Server Error: ${e} (${
						e instanceof Error ? e.stack : "???"
					})`
				);
			}
		}
	);

	app.put(
		"/api/:system/config",
		auth(api_token_secret),
		express.json(),
		async (req, res) => {
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
					res
						.status(400)
						.type("text/plain")
						.send("Incorrect request body type");
					return;
				}

				await data.set_config(system, config);

				res.status(204).end();
			} catch (e) {
				res.status(500).type("text/plain").send(`Internal Server Error:\n${e}`);
				console.error(
					`Internal Server Error: ${e} (${
						e instanceof Error ? e.stack : "???"
					})`
				);
			}
		}
	);

	app.delete(
		"/api/:system/config",
		auth(api_token_secret),
		async (req, res) => {
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
					`Internal Server Error: ${e} (${
						e instanceof Error ? e.stack : "???"
					})`
				);
			}
		}
	);

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
