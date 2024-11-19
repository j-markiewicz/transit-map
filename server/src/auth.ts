import { boolean, is, optional, string, type } from "superstruct";
import { RequestHandler } from "express";
import { hash, verify } from "argon2";
import { randomBytes } from "crypto";
import jwt from "jsonwebtoken";

const ARGON2ID_TIME_COST = Math.max(
	parseInt(process.env.ARGON2ID_TIME_COST ?? "") || 5,
	3
);

const ARGON2ID_MEMORY_COST = Math.max(
	parseInt(process.env.ARGON2ID_MEMORY_COST ?? "") || 256 * 1024,
	16 * 1024
);

const ARGON2ID_PARALLELISM = Math.max(
	parseInt(process.env.ARGON2ID_PARALLELISM ?? "") || 4,
	1
);

/** hash the given password, with extra time cost if the user is an admin */
export async function hash_password(
	password: string,
	is_admin: boolean = false
): Promise<string> {
	return hash(password, {
		timeCost: ARGON2ID_TIME_COST * (is_admin ? 2 : 1),
		memoryCost: ARGON2ID_MEMORY_COST,
		parallelism: ARGON2ID_PARALLELISM,
	});
}

/** check whether the given password matches the given hash */
export async function verify_password(
	password: string,
	hash: string
): Promise<boolean> {
	return verify(hash, password);
}

/** generate a cryptographically secure random url-safe string */
export async function random(): Promise<string> {
	const BYTES = 512 / 8;

	return new Promise((res, rej) => {
		try {
			randomBytes(BYTES, (err, buf) => {
				if (err !== null) {
					rej(err);
				} else {
					res(buf.toString("base64url"));
				}
			});
		} catch (e: unknown) {
			rej(e);
		}
	});
}

/** api authentication middleware
 *
 * after verifying the api token, this sets `req.user` and `req.is_admin` based
 * on its contents
 *
 * if `required` is `true` (default), a request without a valid token will get
 * rejected, and `req.user` is guaranteed to be set
 */
export function auth(secret: string, required: boolean = true): RequestHandler {
	return async (req, res, next) => {
		const token = req.header("Authorization");

		if (token === undefined || !token.startsWith("Bearer ")) {
			if (!required) {
				next();
				return;
			}

			res
				.status(401)
				.type("text/plain")
				.header("WWW-Authenticate", "Bearer")
				.send("Not authenticated");
			return;
		}

		const payload = await new Promise((res) =>
			jwt.verify(
				token.substring("Bearer ".length),
				secret,
				{
					algorithms: ["HS512"],
					issuer: "transit-map",
				},
				(err, payload) => (err !== null ? res(undefined) : res(payload))
			)
		);

		if (
			payload === undefined ||
			!is(payload, type({ user: string(), is_admin: optional(boolean()) }))
		) {
			if (!required) {
				next();
				return;
			}

			res
				.status(403)
				.type("text/plain")
				.send("Not authorized to perform this request");
			return;
		}

		req.user = payload.user;
		req.is_admin = payload.is_admin;

		next();
	};
}

declare global {
	namespace Express {
		interface Request {
			/** an authenticated user's email address */
			user: string | undefined;
			/** whether the requesting user is an administrator */
			is_admin: boolean | undefined;
		}
	}
}
