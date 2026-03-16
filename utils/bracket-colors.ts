export function getBracketChipColor(
  bracketName: string,
): "default" | "primary" | "secondary" | "success" | "warning" | "danger" {
  switch ((bracketName || "").toLowerCase()) {
    case "challenger":
      return "success";
    case "master":
      return "primary";
    case "amateur":
      return "warning";
    case "common":
      return "default";
    default:
      return "default";
  }
}
