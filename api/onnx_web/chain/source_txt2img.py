from logging import getLogger

import torch
import numpy as np
from diffusers import OnnxStableDiffusionPipeline
from PIL import Image

from ..device_pool import JobContext
from ..diffusion.load import get_latents_from_seed, load_pipeline
from ..params import ImageParams, Size, StageParams
from ..utils import ServerContext

logger = getLogger(__name__)


def source_txt2img(
    job: JobContext,
    server: ServerContext,
    stage: StageParams,
    params: ImageParams,
    source_image: Image.Image,
    *,
    size: Size,
    prompt: str = None,
    **kwargs,
) -> Image.Image:
    prompt = prompt or params.prompt
    logger.info("generating image using txt2img, %s steps: %s", params.steps, prompt)

    if source_image is not None:
        logger.warn(
            "a source image was passed to a txt2img stage, but will be discarded"
        )

    latents = get_latents_from_seed(params.seed, size)
    pipe = load_pipeline(
        OnnxStableDiffusionPipeline, params.model, params.scheduler, job.get_device(), params.lpw
    )

    if params.lpw:
        logger.debug('using LPW pipeline for txt2img')
        rng = torch.manual_seed(params.seed)
        result = pipe.text2img(
            prompt,
            height=size.height,
            width=size.width,
            generator=rng,
            guidance_scale=params.cfg,
            latents=latents,
            negative_prompt=params.negative_prompt,
            num_inference_steps=params.steps,
        )
    else:
        rng = np.random.RandomState(params.seed)
        result = pipe(
            prompt,
            height=size.height,
            width=size.width,
            generator=rng,
            guidance_scale=params.cfg,
            latents=latents,
            negative_prompt=params.negative_prompt,
            num_inference_steps=params.steps,
        )

    output = result.images[0]

    logger.info("final output image size: %sx%s", output.width, output.height)
    return output
