import { describe, it, expect, beforeEach } from "vitest";
import { CheckboxModel } from "./checkbox-model.ts";

describe("CheckboxModel — aggregate", () => {
  let model: CheckboxModel;
  beforeEach(() => {
    model = new CheckboxModel();
  });

  it("all leaves checked → checked", () => {
    model.setChecked(["a", "b"]);
    expect(model.aggregate(["a", "b"])).toBe("checked");
  });

  it("no leaves checked → unchecked", () => {
    expect(model.aggregate(["a", "b"])).toBe("unchecked");
  });

  it("some leaves checked → mixed", () => {
    model.setChecked(["a"]);
    expect(model.aggregate(["a", "b"])).toBe("mixed");
  });

  it("empty input → unchecked", () => {
    model.setChecked(["a"]);
    expect(model.aggregate([])).toBe("unchecked");
  });
});

describe("CheckboxModel — isChecked", () => {
  it("reflects the checked set", () => {
    const model = new CheckboxModel();
    expect(model.isChecked("a")).toBe(false);
    model.setChecked(["a"]);
    expect(model.isChecked("a")).toBe(true);
    expect(model.isChecked("b")).toBe(false);
  });
});

describe("CheckboxModel — toggleOne", () => {
  it("flips a single stored id and returns the new value", () => {
    const model = new CheckboxModel();
    expect(model.toggleOne("a")).toEqual({ checked: true });
    expect(model.isChecked("a")).toBe(true);
    expect(model.toggleOne("a")).toEqual({ checked: false });
    expect(model.isChecked("a")).toBe(false);
  });
});

describe("CheckboxModel — toggleGroup", () => {
  it("unchecked → all checked", () => {
    const model = new CheckboxModel();
    expect(model.toggleGroup(["a", "b"])).toEqual({ checked: true });
    expect(model.getChecked().sort()).toEqual(["a", "b"]);
  });

  it("checked → all unchecked", () => {
    const model = new CheckboxModel();
    model.setChecked(["a", "b"]);
    expect(model.toggleGroup(["a", "b"])).toEqual({ checked: false });
    expect(model.getChecked()).toEqual([]);
  });

  it("mixed → all checked (the cascade convention)", () => {
    const model = new CheckboxModel();
    model.setChecked(["a"]);
    expect(model.toggleGroup(["a", "b"])).toEqual({ checked: true });
    expect(model.getChecked().sort()).toEqual(["a", "b"]);
  });
});

describe("CheckboxModel — setChecked / getChecked", () => {
  it("setChecked replaces the set wholesale", () => {
    const model = new CheckboxModel();
    model.setChecked(["a", "b"]);
    model.setChecked(["c"]);
    expect(model.getChecked()).toEqual(["c"]);
  });

  it("getChecked returns exactly the current set", () => {
    const model = new CheckboxModel();
    model.setChecked(["a", "b", "c"]);
    expect(model.getChecked().sort()).toEqual(["a", "b", "c"]);
  });
});

describe("CheckboxModel — forget", () => {
  it("drops the given ids and leaves others checked", () => {
    const model = new CheckboxModel();
    model.setChecked(["a", "b", "c"]);
    model.forget(["b"]);
    expect(model.getChecked().sort()).toEqual(["a", "c"]);
  });

  it("forgetting an id not in the set is a no-op", () => {
    const model = new CheckboxModel();
    model.setChecked(["a"]);
    model.forget(["z"]);
    expect(model.getChecked()).toEqual(["a"]);
  });
});
