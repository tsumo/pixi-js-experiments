import * as PIXI from "pixi.js";
import gsap from "gsap";
import { Vector2 } from "../types";
import { mapInterval, rand } from "../utils";
import dustMask from "./dust-mask.png";
import dustMaskBig from "./dust-mask-big.png";
import dustOverlayMask from "./dust-overlay-mask.png";
import dustParticle from "./dust-particle.png";

type DustColor = "red" | "white";

export type DustTextInfo = {
  text: string;
  sizePercent: number;
  position: Vector2;
  textColor: DustColor;
  big?: boolean;
};

type DustTextInfoInternal = DustTextInfo & {
  sizePx: number;
  textContainer: PIXI.Container;
  textSprite: PIXI.Sprite;
  textMask: PIXI.Sprite;
  textTimeline: gsap.core.Timeline;
  textOverlaySprite: PIXI.Sprite;
  textOverlaySpriteScale: number;
  textOverlayMask: PIXI.Sprite;
  textOverlayTimeline: gsap.core.Timeline;
  canvas: HTMLCanvasElement;
  particleLocations: [number, number][];
  currentParticleIndex: number;
};

type PixiResources = Record<
  | "textMaskSource"
  | "textMaskBigSource"
  | "textOverlaySpriteSource"
  | "particleSpriteSource",
  PIXI.Texture
>;

class DustService {
  private readonly textInfos: DustTextInfoInternal[] = [];

  private readonly container: PIXI.Container;
  private readonly renderer: PIXI.Renderer;

  private textFadeDistance = 30;
  private textFadeDuration = 1;
  private textFadeStagger = 250;

  private readonly particleSpriteSource: PIXI.Texture;

  private readonly textAnimationDuration = 3;
  private readonly textOverlayAnimationDuration = 0.8;
  private readonly particleAnimationDuration = 3;

  private rafId = 0;

  constructor(
    resources: PixiResources,
    renderer: PIXI.Renderer,
    startingInfo: DustTextInfo[]
  ) {
    const textMaskSource = resources["textMaskSource"];
    const textMaskBigSource = resources["textMaskBigSource"];
    const textOverlaySpriteSource = resources["textOverlaySpriteSource"];
    // Initialize internal text structure
    startingInfo.forEach((info) => {
      const sizePx = window.innerWidth * 0.01 * info.sizePercent;
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      if (!context) {
        return;
      }
      context.font = `${sizePx}px "Nothing You Could Do", cursive`;
      const canvasWidth = context.measureText(info.text).width;
      const canvasHeight = sizePx * 1.2;
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
      this.textInfos.push({
        ...info,
        sizePx,
        textContainer: new PIXI.Container(),
        textSprite: new PIXI.Sprite(),
        textMask: new PIXI.Sprite(
          info.big ? textMaskBigSource : textMaskSource
        ),
        textTimeline: gsap.timeline({ paused: true }),
        textOverlaySprite: new PIXI.Sprite(textOverlaySpriteSource),
        textOverlaySpriteScale: 0,
        textOverlayMask: new PIXI.Sprite(),
        textOverlayTimeline: gsap.timeline({ paused: true }),
        canvas,
        particleLocations: [],
        currentParticleIndex: 0,
      });
    });

    // Initialize PIXI
    this.container = new PIXI.Container();
    this.renderer = renderer;
    // Create particle texture
    this.particleSpriteSource = resources["particleSpriteSource"];

    // Create text sprites and particles
    this.textInfos.forEach((info) => {
      this.drawText(info);
      info.textContainer.alpha = 0;
      info.textContainer.addChild(info.textSprite);
      info.textContainer.addChild(info.textMask);
      info.textContainer.addChild(info.textOverlaySprite);
      info.textContainer.addChild(info.textOverlayMask);

      info.textSprite.position.x = window.innerWidth * info.position.x;
      info.textSprite.position.y = window.innerHeight * info.position.y;

      // Mask sprite is three times longer than the text sprite
      //           [textSprite]
      // [          maskSprite          ]
      // First part of the mask makes text totally invisible
      // Third part of the mask makse text totally visible
      // Second part fades from invisible to visible
      info.textMask.width = info.textSprite.width * 3;
      info.textMask.height = info.textSprite.height;
      info.textMask.position.x =
        window.innerWidth * info.position.x - info.textSprite.width * 2;
      info.textMask.position.y = window.innerHeight * info.position.y;
      info.textSprite.mask = info.textMask;

      info.textOverlaySprite.position.x = info.textSprite.position.x;
      info.textOverlaySprite.position.y = info.textSprite.position.y;

      // Extracting and nullifying scale
      info.textOverlaySprite.width = info.textSprite.width;
      info.textOverlaySpriteScale = info.textOverlaySprite.scale.x * 1.4;
      info.textOverlaySprite.scale.set(0);

      info.textOverlaySprite.position.x =
        window.innerWidth * info.position.x + info.textOverlayMask.width / 2;
      info.textOverlaySprite.position.y =
        window.innerHeight * info.position.y + info.textOverlayMask.height / 2;
      info.textOverlayMask.position.x = window.innerWidth * info.position.x;
      info.textOverlayMask.position.y = window.innerHeight * info.position.y;
      info.textOverlaySprite.mask = info.textOverlayMask;
      info.textOverlaySprite.anchor.set(0.5);
      this.findParticleLocations(info);
      this.initTextAnimation(info);
      this.initTextOverlayAnimation(info);
      this.container.addChild(info.textContainer);
    });

    this.textInfos.forEach((info, i) =>
      setTimeout(() => this.fadeInText(info), i * this.textFadeStagger)
    );

    // Start render loop
    const render = () => {
      this.renderer.render(this.container);
      this.rafId = requestAnimationFrame(render);
    };
    render();
  }

  /** Draw text, generate texture from canvas */
  private drawText(info: DustTextInfoInternal) {
    const context = info.canvas.getContext("2d");
    if (!context) {
      return;
    }
    context.globalCompositeOperation = "source-over";
    context.font = `${info.sizePx}px "Nothing You Could Do", cursive`;
    context.fillStyle = info.textColor;
    context.clearRect(0, 0, info.canvas.width, info.canvas.height);
    context.fillText(info.text, 0, info.sizePx);
    // Convert canvas to sprite, swap main sprite textures
    const newSprite = this.canvasToSprite(info.canvas);
    info.textSprite.texture = newSprite.texture;
    info.textSprite.texture.update();
    info.textOverlayMask.texture = newSprite.texture;
    info.textOverlayMask.texture.update();
  }

  /** HTML canvas to PIXI Sprite */
  private canvasToSprite(canvas: HTMLCanvasElement): PIXI.Sprite {
    return PIXI.Sprite.from(canvas);
  }

  /** Find particle locations from text pixel data */
  private findParticleLocations(info: DustTextInfoInternal) {
    const context = info.canvas.getContext("2d");
    if (!context) {
      return;
    }
    const imageData = context.getImageData(
      0,
      0,
      info.canvas.width,
      info.canvas.width
    );
    const data = imageData.data;
    const skip = 2;
    for (let i = 0; i < imageData.height; i += skip) {
      for (let j = 0; j < imageData.width; j += skip) {
        const alpha = data[j * imageData.width * 4 + i * 4 - 1];
        if (alpha === 255) {
          info.particleLocations.push([
            i + info.position.x * window.innerWidth,
            j + info.position.y * window.innerHeight,
          ]);
        }
      }
    }
  }

  /** Creates new particle and animates it */
  private createNewParticle(info: DustTextInfoInternal, i: number) {
    const particle = new PIXI.Sprite(this.particleSpriteSource);
    // particle.tint = 0xff0000;
    particle.x = info.particleLocations[i][0];
    particle.y = info.particleLocations[i][1];
    particle.scale.x = rand(0.5) + 0.2;
    particle.scale.y = particle.scale.x;
    particle.rotation = rand(Math.PI);
    this.container.addChild(particle);
    const offsetX =
      (rand(info.textSprite.width * 0.6) + info.textSprite.width * 0.2) *
      (info.big ? 0.3 : 1);
    const offsetY =
      (rand(info.textSprite.width * 0.2) + info.textSprite.width * 0.2 * -1) *
      (info.big ? 0.3 : 1);
    gsap.to(particle, {
      x: `+=${offsetX}`,
      y: `+=${offsetY}`,
      alpha: 0,
      duration: this.particleAnimationDuration,
      ease: "power3.out",
      onComplete: () => void this.container.removeChild(particle),
    });
  }

  /** Create timeline for text masking */
  private initTextAnimation(info: DustTextInfoInternal) {
    info.textTimeline
      .add(() => void info.textOverlayTimeline.restart().pause())
      .add(
        gsap.to(info.textMask.position, {
          x: `+=${info.textSprite.width * 3}`,
          duration: this.textAnimationDuration,
          delay: rand(0.3),
          ease: "none",
          onUpdate: () => {
            // Mapping timeline progress interval [0, 1] to interval [0, number-of-particles]
            // [0     ...     0.5     ...     1]
            //  |               \
            //  |                 \
            //  |                   \
            //  |                     \
            //  |                       \
            //  |                         \
            //  |                           \
            // [0                             n]
            const newIndex = Math.min(
              info.particleLocations.length,
              Math.floor(
                mapInterval(
                  0,
                  0.5,
                  0,
                  info.particleLocations.length,
                  info.textTimeline.progress()
                )
              )
            );
            for (let i = info.currentParticleIndex; i < newIndex; i++) {
              this.createNewParticle(info, i);
            }
            info.currentParticleIndex = newIndex;
          },
          onReverseComplete: () => {
            // For some reason timeline.progress() doesn't to all the way to 0 on reverse
            // Manually overwrite mapInterval result to make sure to start new play on first particle
            info.currentParticleIndex = 0;
          },
        })
      );
  }

  private initTextOverlayAnimation(info: DustTextInfoInternal) {
    const last = this.textOverlayAnimationDuration * 0.5;
    info.textOverlayTimeline
      .add(
        gsap.to(info.textOverlaySprite.scale, {
          x: info.textOverlaySpriteScale,
          y: info.textOverlaySpriteScale,
          duration: this.textOverlayAnimationDuration,
        })
      )
      .add(
        gsap.to(info.textSprite, {
          alpha: 0,
          duration: last,
        }),
        this.textOverlayAnimationDuration - last
      );
  }

  private fadeInText(info: DustTextInfoInternal) {
    gsap.fromTo(
      info.textContainer,
      { y: info.textContainer.y + this.textFadeDistance, alpha: 0 },
      { y: info.textContainer.y, alpha: 1, duration: this.textFadeDuration }
    );
  }

  private fadeOutText(info: DustTextInfoInternal) {
    gsap.to(info.textContainer, {
      y: `-=${this.textFadeDistance}`,
      alpha: 0,
      duration: this.textFadeDuration,
    });
  }

  /** Update text rendering from outside */
  redrawByText(text: string, color: DustColor) {
    this.textInfos
      .filter((info) => info.text === text)
      .forEach((info) => {
        info.textColor = color;
        this.drawText(info);
      });
  }

  hoverOver(text: string) {
    this.textInfos
      .filter((info) => info.text === text)
      .forEach((info) => info.textOverlayTimeline.timeScale(1).play());
  }

  hoverOut(text: string) {
    this.textInfos
      .filter((info) => info.text === text)
      .forEach((info) => info.textOverlayTimeline.timeScale(3).reverse());
  }

  startAnimationByText(text: string, fadeOutOtherTexts?: boolean) {
    if (fadeOutOtherTexts) {
      this.textInfos
        .filter((info) => info.text !== text)
        .forEach((info, i) => {
          setTimeout(() => this.fadeOutText(info), i * this.textFadeStagger);
        });
    }
    this.textInfos
      .filter((info) => info.text === text)
      .forEach((info) => {
        this.drawText(info);
        info.textOverlaySprite.alpha = 0;
        info.textTimeline.play();
      });
  }

  stopAnimationByText(text: string) {
    this.textInfos
      .filter((info) => info.text === text)
      .forEach((info) => {
        info.textTimeline.reverse();
      });
  }

  fadeOutAll() {
    this.textInfos.forEach((info, i) =>
      setTimeout(() => this.fadeOutText(info), i * this.textFadeStagger)
    );
  }

  stopService() {
    cancelAnimationFrame(this.rafId);
  }
}

export const initDust = async (canvas: HTMLCanvasElement) => {
  const [
    textMaskSource,
    textMaskBigSource,
    textOverlaySpriteSource,
    particleSpriteSource,
  ] = await Promise.all([
    PIXI.Assets.load(dustMask),
    PIXI.Assets.load(dustMaskBig),
    PIXI.Assets.load(dustOverlayMask),
    PIXI.Assets.load(dustParticle),
  ]);
  const renderer = await PIXI.autoDetectRenderer({
    view: canvas,
    width: window.innerWidth,
    height: window.innerHeight,
  });

  return new DustService(
    {
      textMaskSource,
      textMaskBigSource,
      textOverlaySpriteSource,
      particleSpriteSource,
    },
    renderer,
    [
      {
        text: "asdasd",
        position: { x: 0.5, y: 0.5 },
        sizePercent: 12,
        textColor: "red",
      },
    ]
  );
};
