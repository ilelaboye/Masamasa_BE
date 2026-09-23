import axios, { AxiosRequestConfig, AxiosResponse } from "axios";

interface FetchOptions extends AxiosRequestConfig {
  body?: object;
}

export async function axiosClient<T = any>(
  url: string,
  options: FetchOptions = {},
): Promise<any> {
  // `timeout` was being dropped here, so callers that set one — as every
  // external call is meant to — were still waiting forever. Left undefined
  // when unset, which is axios's own default, so nothing else changes.
  const { method = "GET", body, headers, timeout } = options;

  try {
    const response = await axios({
      method,
      url,
      data: body,
      timeout,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...headers,
      },
    });
    return response.data;
  } catch (error) {
    // console.log("axios error", error);
    // const errorResponse = error.response?.data || {};
    // const errorMessage =
    //   errorResponse.message ||
    //   "There was an error processing this request, please try again later";

    throw error;
  }
}
