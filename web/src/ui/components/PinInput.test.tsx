import { render, screen, fireEvent } from "@testing-library/react";
import { useState } from "react";
import { PinInput } from "./PinInput";

function Harness() {
  const [pin, setPin] = useState("");
  return (
    <>
      <PinInput value={pin} onChange={setPin} label="PIN" />
      <span data-testid="val">{pin}</span>
    </>
  );
}

test("PinInput accepts up to 4 digits and rejects non-digits", () => {
  render(<Harness />);
  const input = screen.getByLabelText("PIN");
  fireEvent.change(input, { target: { value: "12ab34567" } });
  expect(screen.getByTestId("val").textContent).toBe("1234");
});
