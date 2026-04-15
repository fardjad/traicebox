from typing import Optional

from litellm.integrations.custom_logger import CustomLogger
from litellm.litellm_core_utils.llm_request_utils import (
    get_proxy_server_request_headers,
)
from litellm.proxy.proxy_server import DualCache, UserAPIKeyAuth
from litellm.types.utils import CallTypesLiteral


SESSION_HEADER_CANDIDATES = (
    "x-litellm-trace-id",
    "x-litellm-session-id",
    "x-session-affinity",
    "x-opencode-session",
)


def _normalize_headers(headers: dict) -> dict[str, str]:
    normalized_headers: dict[str, str] = {}
    for key, value in headers.items():
        if key is None or value is None:
            continue
        normalized_headers[str(key).lower()] = str(value).strip()
    return normalized_headers


def _extract_session_id(headers: dict[str, str]) -> Optional[str]:
    for header_name in SESSION_HEADER_CANDIDATES:
        value = headers.get(header_name)
        if value:
            return value
    return None


def _get_incoming_headers(data: dict) -> dict[str, str]:
    secret_fields = data.get("secret_fields")
    if isinstance(secret_fields, dict):
        raw_headers = secret_fields.get("raw_headers")
        if isinstance(raw_headers, dict) and raw_headers:
            return _normalize_headers(raw_headers)

    litellm_params = data.get("litellm_params")
    if isinstance(litellm_params, dict):
        headers = get_proxy_server_request_headers(litellm_params)
        if headers:
            return _normalize_headers(headers)

    proxy_server_request = data.get("proxy_server_request")
    if isinstance(proxy_server_request, dict):
        headers = proxy_server_request.get("headers")
        if isinstance(headers, dict) and headers:
            return _normalize_headers(headers)

    return {}


def _ensure_mapping(data: dict, key: str) -> dict:
    current_value = data.get(key)
    if isinstance(current_value, dict):
        return current_value

    replacement: dict = {}
    data[key] = replacement
    return replacement


class RequestSessionMetadataCallback(CustomLogger):
    async def async_pre_call_hook(
        self,
        user_api_key_dict: UserAPIKeyAuth,
        cache: DualCache,
        data: dict,
        call_type: CallTypesLiteral,
    ):
        del user_api_key_dict, cache, call_type

        if data.get("litellm_session_id"):
            return data

        metadata = _ensure_mapping(data, "metadata")
        if metadata.get("session_id"):
            return data

        litellm_metadata = _ensure_mapping(data, "litellm_metadata")
        if litellm_metadata.get("session_id"):
            return data

        headers = _get_incoming_headers(data)
        session_id = _extract_session_id(headers)
        if not session_id:
            return data

        parent_session_id = headers.get("x-parent-session-id")
        data["litellm_session_id"] = session_id
        data["litellm_trace_id"] = session_id
        metadata.setdefault("session_id", session_id)
        metadata.setdefault("trace_id", session_id)
        litellm_metadata.setdefault("session_id", session_id)
        litellm_metadata.setdefault("trace_id", session_id)

        if parent_session_id:
            metadata.setdefault("parent_session_id", parent_session_id)
            litellm_metadata.setdefault("parent_session_id", parent_session_id)

        return data


proxy_handler_instance = RequestSessionMetadataCallback()
