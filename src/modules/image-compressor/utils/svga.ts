import * as fs from "fs/promises";
import * as pako from "pako";
import protobuf from "protobufjs";
import svgaProto from "@image-compressor/config/svgaProto.json";
import { SvgaParsed } from "@image-compressor/typing";
import type sharp from "sharp";

class SvgaUtility {
  private sharp: typeof sharp | undefined;
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
    }
    const result = {};
    for (const [frame, buffer] of Object.entries(movieEntity.images)) {
      const optimizedBuffer = await this.sharp(buffer)
        .png({
          quality: 75,
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
