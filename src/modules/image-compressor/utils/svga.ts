import * as fs from "fs/promises";
import * as pako from "pako";
import protobuf from "protobufjs";
import svgaProto from "@image-compressor/config/svgaProto.json";
import { SvgaParsed } from "@image-compressor/typing";
import * as os from "os";

const QUALITY = 70;

class SvgaUtility {
  private sharp: typeof import("sharp") | undefined;
  public protoMovieEntity = protobuf.Root.fromJSON(svgaProto).lookupType("com.opensource.svga.MovieEntity");

  public async parse(fsPath: string): Promise<{
    movieEntity: SvgaParsed.MovieEntity;
  }> {
    const buffer = await fs.readFile(fsPath);
    const movieEntity = this.protoMovieEntity.decode(pako.inflate(Uint8Array.from(buffer)));
    return {
      movieEntity: movieEntity as unknown as SvgaParsed.MovieEntity,
    };
  }

  public async compress(fsPath: string, destinationFsPath: string) {
    const { movieEntity } = await this.parse(fsPath);
    if (!this.sharp) {
      this.sharp = (await import("sharp")).default;
      // Reducing concurrency should reduce the memory usage too.
      const divisor = process.env.NODE_ENV === "development" ? 4 : 2;
      this.sharp.concurrency(Math.floor(Math.max(os.cpus().length / divisor, 1)));
    }
    const result = {};
    for (const [frame, buffer] of Object.entries(movieEntity.images)) {
      const optimizedBuffer = await this.sharp(buffer)
        .png({
          quality: QUALITY,
          palette: true,
        })
        .toBuffer();
      result[frame] = optimizedBuffer;
    }
    movieEntity.images = result;
    const file = pako.deflate(this.protoMovieEntity.encode(movieEntity).finish().buffer);
    await fs.writeFile(destinationFsPath, file);
    return {
      parsedInfo: movieEntity,
      destination: destinationFsPath,
    };
  }
}

export default new SvgaUtility();
