import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { Producto } from '../models/producto.model';
@Injectable({
  providedIn: 'root',
})
export class ProductosService {

  productos$?: Observable<Producto[]>;
  categorias: any[] = [
    { categoria: "POK", nombre: 'Pokémon' },
    { categoria: "YGO", nombre: 'Yu-Gi-Oh!' },
    { categoria: "MTG", nombre: 'Magic: The Gathering' },
    { categoria: "OPI", nombre: 'One Piece' },
    { categoria: "DBF", nombre: 'Dragon Ball' },
    { categoria: "DIG", nombre: 'Digimon' },
    { categoria: "LOR", nombre: 'Disney Lorcana' },
    { categoria: "ACC", nombre: 'Accesorios' },
  ];

  constructor() {}

  obtenerPresentacion(presentacion: string): string {
    switch (presentacion) {
      case "SBR":
      case "SSBR":
        return 'Sobre';
      case "PAQ":
      case "BB6":
      case "3PK":
        return 'Paquete';
      case "UNI":
        return 'Unidad';
      case "PAR":
        return 'Par';
      case "TRI":
        return 'Trio';
      case "TIN":
        return 'Lata';
      case "B36":
      case "BBA":
      case "SUR":
      case "PRC":
      case "PCO":
      case "BCO":
      case "CES":
      case "SPC":
      case "CJA":
      case "B24":
      case "SPE":
      case "MAT":
        return 'Caja';
      case "ETB":
        return 'ETB';
      case "ALE":
        return 'Mazo';
      case "DCK":
      case "BD1":
      case "BD2":
      case "BD3":
        return 'Deck';
      case "BLI":
        return 'Blister';
      default:
        return 'N/A';
    }
  }

  obtenerCategorias() {
    return this.categorias;
  }
}
