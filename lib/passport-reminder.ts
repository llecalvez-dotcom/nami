export function missingPassportMessage(readerAvailable: boolean, documentsAvailable: boolean): string {
  if (documentsAvailable) return "I need your passport. Shall I look for it on this computer?";
  return readerAvailable
    ? "Upload a photo or enter your passport details in the passport card, then confirm the fields before I create your visa."
    : "Enter your passport details in the passport card, then confirm the fields before I create your visa.";
}
