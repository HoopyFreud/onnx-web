from logging import getLogger

from PIL import Image

from ..output import save_image
from ..params import ImageParams, StageParams
from ..server import JobContext, ServerContext

logger = getLogger(__name__)


def persist_disk(
    _job: JobContext,
    server: ServerContext,
    _stage: StageParams,
    _params: ImageParams,
    source: Image.Image,
    *,
    output: str,
    **kwargs,
) -> Image.Image:
    dest = save_image(server, output, source)
    logger.info("saved image to %s", dest)
    return source
