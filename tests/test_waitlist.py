"""Waitlist endpoint: validation, honeypot, rate limit, and the Resend request it sends (network mocked)."""
from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from klew import api


class _Resp:
    status = 200

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


@pytest.fixture
def client(monkeypatch):
    sent: list = []

    def fake_urlopen(req, timeout=0):
        sent.append(req)
        return _Resp()

    monkeypatch.setattr(api.urllib.request, "urlopen", fake_urlopen)
    monkeypatch.setenv("RESEND_API_KEY", "re_test")
    monkeypatch.setenv("WAITLIST_TO", "owner@example.com")
    api._wl_hits.clear()
    c = TestClient(api.app)
    c.sent = sent
    return c


def test_valid_signup_emails_owner(client):
    r = client.post("/api/waitlist", json={"name": "Ada", "email": "ada@example.org",
                                           "repo_url": "github.com/ada/engine"})
    assert r.status_code == 200 and r.json() == {"ok": True}
    req = client.sent[0]
    assert req.full_url == "https://api.resend.com/emails"
    assert req.get_header("Authorization") == "Bearer re_test"
    body = json.loads(req.data)
    assert body["to"] == ["owner@example.com"] and body["reply_to"] == "ada@example.org"
    assert "Ada" in body["subject"] and "github.com/ada/engine" in body["text"]


def test_rejects_bad_email_and_repo(client):
    assert client.post("/api/waitlist", json={"name": "Ada", "email": "not-an-email"}).status_code == 422
    r = client.post("/api/waitlist", json={"name": "Ada", "email": "ada@example.org", "repo_url": "not a url"})
    assert r.status_code == 422
    assert client.sent == []


def test_honeypot_pretends_success_without_sending(client):
    r = client.post("/api/waitlist", json={"name": "Bot", "email": "b@example.org", "website": "spam.example"})
    assert r.status_code == 200 and client.sent == []


def test_rate_limited_per_ip(client):
    ok = [client.post("/api/waitlist", json={"name": f"P{i}", "email": f"p{i}@example.org"}).status_code
          for i in range(api.WAITLIST_PER_10MIN)]
    assert ok == [200] * api.WAITLIST_PER_10MIN
    assert client.post("/api/waitlist", json={"name": "X", "email": "x@example.org"}).status_code == 429


def test_not_configured_is_explicit(client, monkeypatch):
    monkeypatch.delenv("RESEND_API_KEY")
    r = client.post("/api/waitlist", json={"name": "Ada", "email": "ada@example.org"})
    assert r.status_code == 503 and "isn't configured" in r.json()["detail"]
