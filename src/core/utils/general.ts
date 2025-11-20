import { generateAlphaNumericString } from "../helpers";

export const generateVtpassRequestId = (user_id) => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0"); // Months are zero-based
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  const masaId = `MASA${generateAlphaNumericString(10)}`; // Example of an alphanumeric string to concatenate

  return `${year}${month}${day}${hours}${minutes}${masaId}00${user_id}`;
};
