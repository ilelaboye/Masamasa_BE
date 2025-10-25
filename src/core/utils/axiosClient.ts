import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';

interface FetchOptions extends AxiosRequestConfig {
  body?: object;
}

export async function axiosClient(url: string, options: FetchOptions = {}): Promise<AxiosResponse> {
  const { method = 'GET', body, headers } = options;

  try {
    const response = await axios({
      method,
      url,
      data: body,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...headers,
      },
    });
    return response.data;
  } catch (error) {
    const errorResponse = error.response?.data || {};
    const errorMessage = errorResponse.message || 'There was an error processing this request, please try again later';

    throw new Error(errorMessage);
  }
}
