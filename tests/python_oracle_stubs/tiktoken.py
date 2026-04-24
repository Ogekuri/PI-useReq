"""!
@file tiktoken.py
@brief Provides a minimal `tiktoken` compatibility shim for Python oracle tests.
@details Delegates token counting to the repository's Node `js-tiktoken` dependency so Python oracle runs stay aligned with the TypeScript implementation without installing the real Python package. Runtime is dominated by short-lived Node subprocess execution. Side effects are limited to subprocess creation.
"""

from __future__ import annotations

import json
import os
import subprocess
from dataclasses import dataclass
from typing import Sequence

_NODE_SCRIPT = (
    "import { getEncoding } from 'js-tiktoken';"
    "const [, encodingName, textJson] = process.argv;"
    "const encoding = getEncoding(encodingName);"
    "const text = JSON.parse(textJson);"
    "process.stdout.write(String(encoding.encode(text).length));"
)
"""! @brief Inline Node program used to proxy token counts through `js-tiktoken`."""


@dataclass(frozen=True)
class _EncodingProxy:
    """!
    @brief Proxies `encode(...)` calls to Node `js-tiktoken`.
    @details Spawns `node --input-type=module -e <script>` for each encode request, reads the emitted integer token count, and returns a list of placeholder integers whose length matches the reported count. Runtime is dominated by subprocess execution. Side effects are limited to subprocess creation.
    @param encoding_name {str} Canonical tokenizer encoding name.
    @return {_EncodingProxy} Proxy instance bound to one encoding family.
    """

    encoding_name: str

    def encode(self, content: str, disallowed_special: Sequence[str] = ()) -> list[int]:
        """!
        @brief Encode text and return a placeholder token sequence with the correct length.
        @details Ignores `disallowed_special` because the Node proxy uses the repository's default `js-tiktoken` behavior, which matches the TypeScript implementation. Runtime is dominated by subprocess execution. Side effects are limited to subprocess creation.
        @param content {str} Text to tokenize.
        @param disallowed_special {Sequence[str]} Unused compatibility parameter accepted for API parity.
        @return {list[int]} Placeholder token list whose length matches the delegated token count.
        @throws {RuntimeError} Raised when the Node proxy cannot execute successfully.
        """
        del disallowed_special
        node_root = os.environ.get("PI_USEREQ_NODE_ROOT")
        if not node_root:
            raise RuntimeError("PI_USEREQ_NODE_ROOT is required for the oracle tiktoken shim.")
        result = subprocess.run(
            [
                "node",
                "--input-type=module",
                "-e",
                _NODE_SCRIPT,
                self.encoding_name,
                json.dumps(content),
            ],
            cwd=node_root,
            check=False,
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            raise RuntimeError(result.stderr.strip() or "Node token proxy failed.")
        token_count = int(result.stdout.strip() or "0")
        return [0] * token_count


def get_encoding(encoding_name: str) -> _EncodingProxy:
    """!
    @brief Return the compatibility proxy for one encoding family.
    @details Mirrors the real `tiktoken.get_encoding(...)` entry point used by the Python oracle and binds the requested encoding name to a proxy instance. Runtime is O(1). No external state is mutated.
    @param encoding_name {str} Canonical tokenizer encoding name.
    @return {_EncodingProxy} Encoding proxy instance.
    """
    return _EncodingProxy(encoding_name)
