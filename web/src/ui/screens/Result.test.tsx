import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { Result } from "./Result";

test("shows the original photo and the generated back side by side", () => {
  render(
    <Result
      originalUrl="blob:original"
      imageUrl="blob:back"
      onSave={() => {}}
      onRetry={() => {}}
      onDiscard={() => {}}
    />,
  );

  const imgs = screen.getAllByRole("img");
  expect(imgs).toHaveLength(2);
  expect(screen.getByAltText(/original/i)).toHaveAttribute("src", "blob:original");
  expect(screen.getByAltText(/back of their head/i)).toHaveAttribute("src", "blob:back");
});

test("Save invokes onSave", () => {
  const onSave = vi.fn();
  render(
    <Result originalUrl="blob:o" imageUrl="blob:b" onSave={onSave} onRetry={() => {}} onDiscard={() => {}} />,
  );
  screen.getByRole("button", { name: /^save$/i }).click();
  expect(onSave).toHaveBeenCalledTimes(1);
});
