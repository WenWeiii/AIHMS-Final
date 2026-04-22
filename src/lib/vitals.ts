import { HealthData } from "../types";

export interface DisplayVitals {
  heartRate: string;
  weight: string;
  steps: string;
  bloodPressure: string;
  sleepHours: string;
}

export const getDisplayVitals = (data: HealthData): DisplayVitals => {
  // 1. Try top-level fields first
  let hr = (data.heartRate && data.heartRate > 0) ? data.heartRate.toString() : '';
  let w = (data.weight && data.weight > 0) ? data.weight.toString() : '';
  let s = data.steps?.toString() || '';
  let bp = (data.bloodPressure && data.bloodPressure !== '0/0') ? data.bloodPressure : '';
  let sl = (data.sleepHours && data.sleepHours > 0) ? data.sleepHours.toString() : '';

  // 2. Fallback to analysis.extractedVitals if top-level is missing
  if (data.analysis?.extractedVitals) {
    data.analysis.extractedVitals.forEach(v => {
      const code = v.code.coding[0].code;
      const value = v.valueQuantity?.value;
      
      if (!hr && code === '8867-4' && value && value > 0) {
        hr = value.toString();
      }
      if (!w && code === '29463-7' && value && value > 0) {
        w = value.toString();
      }
      if (!s && code === '74330-2' && typeof value === 'number') {
        s = value.toString();
      }
      if (!bp && code === '85354-9' && v.component) {
        const sys = v.component.find(c => c.code.coding[0].code === '8480-6')?.valueQuantity.value;
        const dia = v.component.find(c => c.code.coding[0].code === '8462-4')?.valueQuantity.value;
        if (sys && dia && sys > 0 && dia > 0) bp = `${sys}/${dia}`;
      }
    });
  }

  return {
    heartRate: hr || '--',
    weight: w || '--',
    steps: s || '0',
    bloodPressure: bp || '--/--',
    sleepHours: sl || '--'
  };
};
