import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyCategory, classifyMaturity, classifyVersion, hashString } from "./feed.js";

describe("classifyVersion", () => {
  it("returns major for X.0.0 versions", () => {
    assert.equal(classifyVersion("2.0.0"), "major");
    assert.equal(classifyVersion("1.0.0"), "major");
    assert.equal(classifyVersion("10.0.0"), "major");
  });

  it("returns major for X.0 versions", () => {
    assert.equal(classifyVersion("3.0"), "major");
  });

  it("returns major for single-segment versions", () => {
    assert.equal(classifyVersion("5"), "major");
  });

  it("returns minor for X.Y.0 versions", () => {
    assert.equal(classifyVersion("1.2.0"), "minor");
    assert.equal(classifyVersion("0.3.0"), "minor");
  });

  it("returns minor for X.Y versions where Y > 0", () => {
    assert.equal(classifyVersion("1.4"), "minor");
  });

  it("returns patch for X.Y.Z versions where Z > 0", () => {
    assert.equal(classifyVersion("1.2.3"), "patch");
    assert.equal(classifyVersion("0.0.1"), "patch");
    assert.equal(classifyVersion("4.3.12"), "patch");
  });

  it("handles v-prefixed versions", () => {
    assert.equal(classifyVersion("v2.0.0"), "major");
    assert.equal(classifyVersion("V1.3.0"), "minor");
    assert.equal(classifyVersion("v0.1.2"), "patch");
  });

  it("returns patch for empty or missing input", () => {
    assert.equal(classifyVersion(""), "patch");
    assert.equal(classifyVersion(null), "patch");
    assert.equal(classifyVersion(undefined), "patch");
  });

  it("returns patch for non-numeric versions", () => {
    assert.equal(classifyVersion("beta"), "patch");
  });

  it("handles four-segment versions", () => {
    assert.equal(classifyVersion("1.2.3.4"), "patch");
    assert.equal(classifyVersion("1.0.0.0"), "major");
  });
});

describe("classifyMaturity", () => {
  it("returns early for 0.x versions", () => {
    assert.equal(classifyMaturity("0.1.0"), "early");
    assert.equal(classifyMaturity("0.99.3"), "early");
  });

  it("returns early for new packages", () => {
    assert.equal(classifyMaturity("new"), "early");
  });

  it("returns early for empty/missing input", () => {
    assert.equal(classifyMaturity(""), "early");
    assert.equal(classifyMaturity(null), "early");
    assert.equal(classifyMaturity(undefined), "early");
  });

  it("returns growing for 1.x and 2.x versions", () => {
    assert.equal(classifyMaturity("1.0.0"), "growing");
    assert.equal(classifyMaturity("1.5.3"), "growing");
    assert.equal(classifyMaturity("2.0.0"), "growing");
    assert.equal(classifyMaturity("2.99.1"), "growing");
  });

  it("returns mature for 3+ versions", () => {
    assert.equal(classifyMaturity("3.0.0"), "mature");
    assert.equal(classifyMaturity("4.2.1"), "mature");
    assert.equal(classifyMaturity("24.0.1"), "mature");
  });

  it("handles v-prefixed versions", () => {
    assert.equal(classifyMaturity("v0.1.0"), "early");
    assert.equal(classifyMaturity("v3.0"), "mature");
  });
});

describe("classifyCategory", () => {
  it("detects web frameworks", () => {
    assert.equal(classifyCategory("django-rest", "REST framework for Django"), "web");
    assert.equal(classifyCategory("my-lib", "A FastAPI middleware"), "web");
    assert.equal(classifyCategory("flask-utils", "Utilities for Flask"), "web");
  });

  it("detects data tools", () => {
    assert.equal(classifyCategory("my-etl", "ETL pipeline for data warehouses"), "data");
    assert.equal(classifyCategory("pandas-ext", "Extensions for pandas"), "data");
    assert.equal(classifyCategory("db-tools", "SQL database utilities"), "data");
  });

  it("detects ML/AI", () => {
    assert.equal(classifyCategory("my-model", "Train neural networks"), "ml");
    assert.equal(classifyCategory("llm-tools", "LLM inference helpers"), "ml");
    assert.equal(classifyCategory("bert-fine", "Fine-tune BERT models"), "ml");
  });

  it("detects CLI tools", () => {
    assert.equal(classifyCategory("my-cli", "Command line tool"), "cli");
    assert.equal(classifyCategory("clicker", "Built with Click"), "cli");
  });

  it("detects testing tools", () => {
    assert.equal(classifyCategory("pytest-foo", "Pytest plugin for foo"), "test");
    assert.equal(classifyCategory("my-lib", "Mock utilities for testing"), "test");
  });

  it("detects infrastructure tools", () => {
    assert.equal(classifyCategory("k8s-helper", "Kubernetes deployment"), "infra");
    assert.equal(classifyCategory("tf-module", "Terraform module for AWS"), "infra");
  });

  it("returns general for unrecognized packages", () => {
    assert.equal(classifyCategory("cool-lib", "A really cool library"), "general");
    assert.equal(classifyCategory("utils", ""), "general");
  });

  it("matches on name even if description is empty", () => {
    assert.equal(classifyCategory("django-allauth", ""), "web");
  });

  it("is case-insensitive", () => {
    assert.equal(classifyCategory("my-lib", "FLASK middleware"), "web");
    assert.equal(classifyCategory("my-lib", "PyTest plugin"), "test");
  });

  it("respects priority order — first match wins", () => {
    // "web" comes before "data" in the pattern list
    assert.equal(classifyCategory("my-lib", "REST API for database queries"), "web");
  });
});

describe("hashString", () => {
  it("returns a non-negative integer", () => {
    const result = hashString("pip");
    assert.equal(typeof result, "number");
    assert.ok(result >= 0);
    assert.equal(result, Math.floor(result));
  });

  it("is deterministic — same input always produces same output", () => {
    assert.equal(hashString("requests"), hashString("requests"));
    assert.equal(hashString("numpy"), hashString("numpy"));
  });

  it("produces different values for different inputs", () => {
    assert.notEqual(hashString("pip"), hashString("requests"));
    assert.notEqual(hashString("a"), hashString("b"));
  });

  it("handles empty string", () => {
    assert.equal(hashString(""), 0);
  });
});
