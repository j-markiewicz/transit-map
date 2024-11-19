import { hash, verify } from "argon2";
import { randomBytes } from "crypto";

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
