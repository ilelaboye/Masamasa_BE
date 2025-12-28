import fetch from "node-fetch";

interface FetchOptions {
  method?: string;
  body?: object;
  headers?: Record<string, string>;
}

export async function fetcher<T>(
  url: string,
  options: FetchOptions = {},
): Promise<T> {
  const { method = "GET", body = null, headers = {} } = options;

  const response = await fetch(url, {
    method,
    body: body ? JSON.stringify(body) : undefined,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...headers,
    },
  });

  if (!response.ok) {
    const err = await response.json();

    let errorMessage = "Failed to get a response";
    if (typeof err == "object" && err != null && "message" in err) {
      errorMessage = err.message as string;
    }
    const error = new Error(errorMessage);
    error.cause = { response: err };

    throw error;
  }

  const data = await response.json();

  return data as T;
}
