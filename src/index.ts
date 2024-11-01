import { Hono } from "hono";
import { authApp } from "./auth";

const app = new Hono();

app.get("/", (c) => {
	return c.html(
		'<!doctype html><meta charset="utf-8"><title>Hono OIDC example</title><a href="/auth/sign_in">Sign in</a>',
	);
});

app.route("/auth", authApp);

export default app;
