import * as fs from "fs/promises";
import * as pako from "pako";
import protobuf from "protobufjs";
import sharp from "sharp";
import logger from "./logger";
import svgaProto from "../config/svgaProto.json";
import { SvgaParsed } from "../typing";

class SvgaUtility {
  public protoMovieEntity = protobuf.Root.fromJSON(svgaProto).lookupType("com.opensource.svga.MovieEntity");

  public async parse(fsPath: string): Promise<{
    movieEntity: SvgaParsed.MovieEntity;
  }> {
    const buffer = await fs.readFile(fsPath);
    const movieEntity = this.protoMovieEntity.decode(pako.inflate(Uint8Array.from(buffer)));
    logger.info("svga.movieEntity", movieEntity);
    return {
      movieEntity: movieEntity as unknown as SvgaParsed.MovieEntity,
    };
  }

  public async compress(fsPath: string, destinationFsPath: string) {
    const { movieEntity } = await this.parse(fsPath);
    const result = {};
    for (const [frame, buffer] of Object.entries(movieEntity.images)) {
      const optimizedBuffer = await sharp(buffer)
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
