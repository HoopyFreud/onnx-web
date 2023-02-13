import { doesExist, Maybe, mustExist } from '@apextoaster/js-utils';
import { FormatColorFill, Gradient, InvertColors, Undo } from '@mui/icons-material';
import { Button, Stack, Typography } from '@mui/material';
import { createLogger } from 'browser-bunyan';
import { throttle } from 'lodash';
import React, { RefObject, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from 'zustand';

import { SAVE_TIME } from '../../config.js';
import { ConfigContext, StateContext } from '../../state.js';
import { imageFromBlob } from '../../utils.js';
import { NumericField } from './NumericField';

export const DRAW_TIME = 25;
export const FULL_CIRCLE = 2 * Math.PI;
export const FULL_OPACITY = 1.0;
export const MASK_OPACITY = 0.75;
export const PIXEL_SIZE = 4;
export const PIXEL_WEIGHT = 3;

export const COLORS = {
  black: 0,
  white: 255,
};

export const THRESHOLDS = {
  lower: 34,
  upper: 224,
};

export const MASK_STATE = {
  clean: 'clean',
  painting: 'painting',
  dirty: 'dirty',
};

export type FloodFn = (n: number) => number;

export interface Point {
  x: number;
  y: number;
}

export interface MaskCanvasProps {
  source?: Maybe<Blob>;
  mask?: Maybe<Blob>;

  onSave: (blob: Blob) => void;
}

const logger = createLogger({ name: 'react', level: 'debug' }); // TODO: hackeroni and cheese

export function MaskCanvas(props: MaskCanvasProps) {
  const { source, mask } = props;
  const { params } = mustExist(useContext(ConfigContext));

  function composite() {
    if (doesExist(maskRef.current)) {
      const { ctx } = getClearContext(maskRef);

      if (doesExist(bufferRef.current)) {
        ctx.globalAlpha = MASK_OPACITY;
        ctx.drawImage(bufferRef.current, 0, 0);
      }

      if (doesExist(brushRef.current) && painting.current === false) {
        ctx.drawImage(brushRef.current, 0, 0);
      }
    }
  }

  function drawBrush(point: Point): void {
    const { ctx } = getClearContext(brushRef);
    ctx.fillStyle = grayToRGB(brush.color, brush.strength);

    drawCircle(ctx, {
      x: point.x,
      y: point.y,
    }, brush.size);

    composite();
  }

  function drawClicks(clicks: Array<Point>): void {
    if (clicks.length > 0) {
      logger.debug('drawing clicks', { count: clicks.length });

      const { ctx } = getContext(bufferRef);
      ctx.fillStyle = grayToRGB(brush.color, brush.strength);

      for (const click of clicks) {
        drawCircle(ctx, click, brush.size);
      }

      dirty.current = true;
      composite();
    }
  }

  async function drawMask(file: Blob): Promise<void> {
    const image = await imageFromBlob(file);
    if (doesExist(bufferRef.current)) {
      logger.debug('draw mask');

      const { canvas, ctx } = getClearContext(maskRef);
      ctx.globalAlpha = FULL_OPACITY;
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

      composite();
    }
  }

  function drawUndo(): void {
    if (doesExist(bufferRef.current) && doesExist(undoRef.current)) {
      logger.debug('draw undo');

      const { ctx } = getClearContext(bufferRef);
      ctx.drawImage(undoRef.current, 0, 0);

      composite();
    }
  }

  function finishPainting() {
    logger.debug('finish painting');
    painting.current = false;

    if (doesExist(brushRef.current)) {
      getClearContext(brushRef);
    }

    if (dirty.current) {
      save();
    }
  }

  function saveUndo(): void {
    if (doesExist(bufferRef.current) && doesExist(undoRef.current)) {
      logger.debug('save undo');
      const { ctx } = getClearContext(undoRef);
      ctx.drawImage(bufferRef.current, 0, 0);
    }
  }

  function saveMask(): void {
    if (doesExist(bufferRef.current)) {
      logger.debug('save mask');
      if (dirty.current === false) {
        return;
      }

      bufferRef.current.toBlob((blob) => {
        dirty.current = false;
        props.onSave(mustExist(blob));
      });
    }
  }

  const save = useMemo(() => throttle(saveMask, SAVE_TIME), []);

  // eslint-disable-next-line no-null/no-null
  const brushRef = useRef<HTMLCanvasElement>(null);
  // eslint-disable-next-line no-null/no-null
  const bufferRef = useRef<HTMLCanvasElement>(null);
  // eslint-disable-next-line no-null/no-null
  const maskRef = useRef<HTMLCanvasElement>(null);
  // eslint-disable-next-line no-null/no-null
  const undoRef = useRef<HTMLCanvasElement>(null);

  // painting state
  const painting = useRef(false);
  const dirty = useRef(false);
  const background = useRef<string>();

  const state = mustExist(useContext(StateContext));
  const brush = useStore(state, (s) => s.brush);
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const setBrush = useStore(state, (s) => s.setBrush);

  useEffect(() => {
    if (dirty.current) {
      save();
    }
  }, [dirty.current]);

  useEffect(() => {
    if (doesExist(bufferRef.current) && doesExist(mask)) {
      drawMask(mask).catch((err) => {
        // TODO: handle
      });
    }
  }, [mask]);

  useEffect(() => {
    if (doesExist(source)) {
      if (doesExist(background.current)) {
        URL.revokeObjectURL(background.current);
      }

      background.current = URL.createObjectURL(source);

      // initialize the mask if it does not exist
      if (doesExist(mask) === false) {
        getClearContext(bufferRef);
        dirty.current = true;
      }
    }
  }, [source]);

  // last resort to draw lost clicks
  // const lostClicks = drawClicks();
  logger.debug('rendered');
  // draw(clicks, setClicks);

  const styles: React.CSSProperties = {
    backgroundPosition: 'top left',
    backgroundRepeat: 'no-repeat',
    backgroundSize: 'contain',
    border: '1px solid black',
    maxHeight: params.height.default,
    maxWidth: params.width.default,
  };

  if (doesExist(background.current)) {
    styles.backgroundImage = `url(${background.current})`;
  }

  return <Stack spacing={2}>
    <canvas
      ref={brushRef}
      height={params.height.default}
      width={params.width.default}
      style={{
        ...styles,
        display: 'none',
      }}
    />
    <canvas
      ref={bufferRef}
      height={params.height.default}
      width={params.width.default}
      style={{
        ...styles,
        display: 'none',
      }}
    />
    <canvas
      ref={undoRef}
      height={params.height.default}
      width={params.width.default}
      style={{
        ...styles,
        display: 'none',
      }}
    />
    <canvas
      ref={maskRef}
      height={params.height.default}
      width={params.width.default}
      style={styles}
      onClick={(event) => {
        logger.debug('mouse click', { state: painting.current });
        const canvas = mustExist(maskRef.current);
        const bounds = canvas.getBoundingClientRect();

        drawClicks([{
          x: event.clientX - bounds.left,
          y: event.clientY - bounds.top,
        }]);
      }}
      onMouseDown={() => {
        logger.debug('mouse down', { state: painting.current });
        painting.current = true;

        saveUndo();
      }}
      onMouseLeave={finishPainting}
      onMouseOut={finishPainting}
      onMouseUp={finishPainting}
      onMouseMove={(event) => {
        const canvas = mustExist(maskRef.current);
        const bounds = canvas.getBoundingClientRect();

        if (painting.current) {
          drawClicks([{
            x: event.clientX - bounds.left,
            y: event.clientY - bounds.top,
          }]);
        } else {
          drawBrush({
            x: event.clientX - bounds.left,
            y: event.clientY - bounds.top,
          });
        }
      }}
    />
    <Typography variant='body1'>
      Black pixels in the mask will stay the same, white pixels will be replaced. The masked pixels will be blended
      with the noise source before the diffusion model runs, giving it more variety to use.
    </Typography>
    <Stack>
      <Stack direction='row' spacing={4}>
        <NumericField
          label='Brush Color'
          min={COLORS.black}
          max={COLORS.white}
          step={1}
          value={brush.color}
          onChange={(color) => {
            setBrush({ color });
          }}
        />
        <NumericField
          label='Brush Size'
          min={1}
          max={64}
          step={1}
          value={brush.size}
          onChange={(size) => {
            setBrush({ size });
          }}
        />
        <NumericField
          decimal
          label='Brush Strength'
          min={0}
          max={1}
          step={0.01}
          value={brush.strength}
          onChange={(strength) => {
            setBrush({ strength });
          }}
        />
      </Stack>
      <Stack direction='row' spacing={2}>
        <Button
          variant='outlined'
          startIcon={<Undo />}
          onClick={() => drawUndo()}
        />
        <Button
          variant='outlined'
          startIcon={<FormatColorFill />}
          onClick={() => {
            floodCanvas(maskRef, floodBlack);
            composite();
            dirty.current = true;
          }}>
          Fill with black
        </Button>
        <Button
          variant='outlined'
          startIcon={<FormatColorFill />}
          onClick={() => {
            floodCanvas(maskRef, floodWhite);
            composite();
            dirty.current = true;
          }}>
          Fill with white
        </Button>
        <Button
          variant='outlined'
          startIcon={<InvertColors />}
          onClick={() => {
            floodCanvas(maskRef, floodInvert);
            composite();
            dirty.current = true;
          }}>
          Invert
        </Button>
        <Button
          variant='outlined'
          startIcon={<Gradient />}
          onClick={() => {
            floodCanvas(maskRef, floodBelow);
            composite();
            dirty.current = true;
          }}>
          Gray to black
        </Button>
        <Button
          variant='outlined'
          startIcon={<Gradient />}
          onClick={() => {
            floodCanvas(maskRef, floodAbove);
            composite();
            dirty.current = true;
          }}>
          Gray to white
        </Button>
      </Stack>
    </Stack>
  </Stack>;
}

function getContext(ref: RefObject<HTMLCanvasElement>) {
  const canvas = mustExist(ref.current);
  const ctx = mustExist(canvas.getContext('2d'));

  return { canvas, ctx };
}

function getClearContext(ref: RefObject<HTMLCanvasElement>) {
  const ret = getContext(ref);
  ret.ctx.clearRect(0, 0, ret.canvas.width, ret.canvas.height);

  return ret;
}

function drawCircle(ctx: CanvasRenderingContext2D, point: Point, size: number): void {
  ctx.beginPath();
  ctx.arc(point.x, point.y, size, 0, FULL_CIRCLE);
  ctx.fill();
}

export function floodBelow(n: number): number {
  if (n < THRESHOLDS.upper) {
    return COLORS.black;
  } else {
    return COLORS.white;
  }
}

export function floodAbove(n: number): number {
  if (n > THRESHOLDS.lower) {
    return COLORS.white;
  } else {
    return COLORS.black;
  }
}

export function floodBlack(): number {
  return COLORS.black;
}

export function floodWhite(): number {
  return COLORS.white;
}

export function floodInvert(n: number): number {
  return COLORS.white - n;
}

export function grayToRGB(n: number, o = 1.0): string {
  return `rgba(${n.toFixed(0)},${n.toFixed(0)},${n.toFixed(0)},${o.toFixed(2)})`;
}

function floodCanvas(ref: RefObject<HTMLCanvasElement>, flood: FloodFn) {
  const { canvas, ctx } = getContext(ref);
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = image.data;

  for (let x = 0; x < canvas.width; ++x) {
    for (let y = 0; y < canvas.height; ++y) {
      const i = (y * canvas.width * PIXEL_SIZE) + (x * PIXEL_SIZE);
      const hue = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / PIXEL_WEIGHT;
      const final = flood(hue);

      pixels[i] = final;
      pixels[i + 1] = final;
      pixels[i + 2] = final;
      // eslint-disable-next-line @typescript-eslint/no-magic-numbers
      pixels[i + 3] = COLORS.white; // fully opaque
    }
  }

  ctx.putImageData(image, 0, 0);
}
