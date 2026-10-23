import pytest
from auth_tokens import AUDIENCE, ISSUER, StaticKeys
from idea_agro_api.auth import OidcVerifier


@pytest.fixture
def verifier() -> OidcVerifier:
    return OidcVerifier(ISSUER, AUDIENCE, StaticKeys())
