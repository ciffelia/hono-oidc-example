import { type Context, Hono } from "hono";
import { env } from "hono/adapter";
import { deleteCookie, setCookie } from "hono/cookie";
import * as client from "openid-client";

const STATE_COOKIE_NAME = "state";
const NONCE_COOKIE_NAME = "nonce";
const CODE_VERIFIER_COOKIE_NAME = "code_verifier";

export const authRoute = new Hono();

authRoute.get("/auth/sign_in", async (c) => {
	const referrer = c.req.header("Referer");
	if (
		referrer === undefined ||
		!URL.canParse(referrer) ||
		new URL(referrer).host !== c.req.header("Host")
	) {
		return c.redirect("/");
	}

	const authEnv = getAuthEnv(c);
	const config = await fetchClientConfig(authEnv);

	const state = client.randomState();
	const nonce = client.randomNonce();
	const codeVerifier = client.randomPKCECodeVerifier();
	const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
	setAuthCookie(c, authEnv, { state, nonce, codeVerifier });

	const redirectUrl = client.buildAuthorizationUrl(config, {
		redirect_uri: authEnv.OIDC_REDIRECT_URI.href,
		scope: "openid",
		state,
		nonce,
		code_challenge: codeChallenge,
		code_challenge_method: "S256",
	});

	return c.redirect(redirectUrl.href);
});

authRoute.get("/auth/callback", async (c) => {
	const authEnv = getAuthEnv(c);
	const config = await fetchClientConfig(authEnv);

	const cookie = getAndDeleteAuthCookie(c, authEnv);
	if (cookie === undefined) {
		c.status(400);
		return c.text("missing required cookies");
	}

	const tokens = await client.authorizationCodeGrant(config, c.req.raw, {
		expectedState: cookie.state,
		expectedNonce: cookie.nonce,
		pkceCodeVerifier: cookie.codeVerifier,
	});
	console.log("Token Endpoint Response", tokens);

	let claims: client.IDToken | undefined;
	try {
		claims = tokens.claims();
		if (claims === undefined) {
			c.status(500);
			return c.text("invalid token endpoint response");
		}
		console.log("ID Token Claims", claims);

		const userInfo = await client.fetchUserInfo(
			config,
			tokens.access_token,
			claims.sub,
		);
		console.log("User Info Response", userInfo);
	} finally {
		if (tokens.refresh_token !== undefined) {
			await client.tokenRevocation(config, tokens.refresh_token, {
				token_type_hint: "refresh_token",
			});
		}
		await client.tokenRevocation(config, tokens.access_token, {
			token_type_hint: "access_token",
		});
	}

	return c.text(`Hello, ${claims.sub}!`);
});

type AuthEnv = {
	OIDC_ISSUER: URL;
	OIDC_CLIENT_ID: string;
	OIDC_CLIENT_SECRET: string;
	OIDC_REDIRECT_URI: URL;
};

const getAuthEnv = (c: Context): AuthEnv => {
	const { OIDC_ISSUER, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET, OIDC_REDIRECT_URI } =
		env<Record<keyof AuthEnv, unknown>>(c);

	if (typeof OIDC_ISSUER !== "string") {
		throw new Error("missing OIDC_ISSUER environment variable");
	}
	if (!URL.canParse(OIDC_ISSUER)) {
		throw new Error("invalid OIDC_ISSUER environment variable");
	}
	if (typeof OIDC_CLIENT_ID !== "string") {
		throw new Error("missing OIDC_CLIENT_ID environment variable");
	}
	if (typeof OIDC_CLIENT_SECRET !== "string") {
		throw new Error("missing OIDC_CLIENT_SECRET environment variable");
	}
	if (typeof OIDC_REDIRECT_URI !== "string") {
		throw new Error("missing OIDC_REDIRECT_URI environment variable");
	}
	if (!URL.canParse(OIDC_REDIRECT_URI)) {
		throw new Error("invalid OIDC_REDIRECT_URI environment variable");
	}

	return {
		OIDC_ISSUER: new URL(OIDC_ISSUER),
		OIDC_CLIENT_ID,
		OIDC_CLIENT_SECRET,
		OIDC_REDIRECT_URI: new URL(OIDC_REDIRECT_URI),
	};
};

const fetchClientConfig = async ({
	OIDC_ISSUER,
	OIDC_CLIENT_ID,
	OIDC_CLIENT_SECRET,
}: AuthEnv): Promise<client.Configuration> => {
	return await client.discovery(
		OIDC_ISSUER,
		OIDC_CLIENT_ID,
		OIDC_CLIENT_SECRET,
	);
};

type AuthCookie = {
	state: string;
	nonce: string;
	codeVerifier: string;
};

const setAuthCookie = (
	c: Context,
	{ OIDC_REDIRECT_URI }: AuthEnv,
	{ state, nonce, codeVerifier }: AuthCookie,
) => {
	const options = {
		path: OIDC_REDIRECT_URI.pathname,
		httpOnly: true,
		secure: true,
	};
	setCookie(c, STATE_COOKIE_NAME, state, options);
	setCookie(c, NONCE_COOKIE_NAME, nonce, options);
	setCookie(c, CODE_VERIFIER_COOKIE_NAME, codeVerifier, options);
};

const getAndDeleteAuthCookie = (
	c: Context,
	{ OIDC_REDIRECT_URI }: AuthEnv,
): AuthCookie | undefined => {
	const options = {
		path: OIDC_REDIRECT_URI.pathname,
	};
	const state = deleteCookie(c, STATE_COOKIE_NAME, options);
	const nonce = deleteCookie(c, NONCE_COOKIE_NAME, options);
	const codeVerifier = deleteCookie(c, CODE_VERIFIER_COOKIE_NAME, options);

	if (
		state === undefined ||
		nonce === undefined ||
		codeVerifier === undefined
	) {
		return undefined;
	}

	return { state, nonce, codeVerifier };
};
