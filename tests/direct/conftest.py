"""
Windows compatibility shim for gltest's direct-mode message injection.

gltest.direct.loader._inject_message_to_fd0 (genlayer-test==0.29.2) does:
    os.dup2(fd, 0)   # duplicate the temp file's fd onto stdin
    os.close(fd)     # close the original fd
    os.unlink(path)  # delete the temp file

On POSIX this works because unlinking an open file just removes the
directory entry while the still-open fd (now living at fd 0) keeps the
data alive. On Windows, os.unlink refuses to remove a file that any
handle still has open - fd 0 still points at it via dup2 - so this raises
PermissionError (WinError 32) on every direct-mode contract deploy.

This is an upstream bug in the library, not in the contract under test.
We patch os.unlink to swallow exactly that failure so test collection
can proceed; the OS will actually delete the temp file once fd 0 is
closed/reused at process exit.
"""
import os

_original_unlink = os.unlink


def _tolerant_unlink(path, *args, **kwargs):
    try:
        _original_unlink(path, *args, **kwargs)
    except PermissionError:
        pass


os.unlink = _tolerant_unlink


# ----------------------------------------------------------------------------
# gltest.direct.wasi_mock._handle_gl_call (genlayer-test==0.29.2) has NO case
# for the "ExecPromptTemplate" gl_call request type -- the request
# gl.eq_principle.prompt_non_comparative uses internally (distinct from the
# plain "ExecPrompt" request gl.nondet.exec_prompt uses, which the mock
# already supports). Unpatched, this means prompt_non_comparative silently
# resolves to None in direct-mode tests. Vulcan.py's alignment judgment
# (P1) uses this primitive for a genuinely independent semantic check, not
# just the structural gate run_nondet_unsafe already provides.
#
# Fix (reused verbatim from AgentIntentSettlement, where this was worked
# out originally): handle ExecPromptTemplate by echoing the leader's own
# "input" text back as the agreed answer by default, while still letting
# vm.mock_llm(pattern, response) override per call by matching against
# that same input text -- exactly the pattern used for the plain
# "ExecPrompt" case elsewhere in these tests.
# ----------------------------------------------------------------------------
from gltest.direct import wasi_mock as _wasi_mock

_original_handle_gl_call = _wasi_mock._handle_gl_call


def _patched_handle_gl_call(vm, request):
    if isinstance(request, dict) and "ExecPromptTemplate" in request:
        return _handle_exec_prompt_template(vm, request["ExecPromptTemplate"])
    return _original_handle_gl_call(vm, request)


def _handle_exec_prompt_template(vm, data):
    import json as _json

    match_text = data.get("input") or data.get("validator_answer") or ""

    override = vm._match_llm_mock(match_text) if match_text else None
    if override is not None:
        if not isinstance(override, str):
            override = _json.dumps(override)
        return {"ok": override}

    return {"ok": match_text}


_wasi_mock._handle_gl_call = _patched_handle_gl_call
